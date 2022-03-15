pragma solidity >=0.8.9;

import "./TransferSwapV2.sol";
import "./TransferSwapV3.sol";
import "./TransferSwapInch.sol";

abstract contract SwapMain is TransferSwapV2, TransferSwapV3, TransferSwapInch {
    using SafeERC20 for IERC20;

    /**
     * @notice called by MessageBus when the tokens are checked to be arrived at this contract's address.
               sends the amount received to the receiver. swaps beforehand if swap behavior is defined in message
     * NOTE: if the swap fails, it sends the tokens received directly to the receiver as fallback behavior
     * @param _token the address of the token sent through the bridge
     * @param _amount the amount of tokens received at this contract through the cross-chain bridge
     * @param _srcChainId source chain ID
     * @param _message SwapRequestV2 message that defines the swap behavior on this destination chain
     */
    function executeMessageWithTransfer(
        address, // _sender
        address _token,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message,
        SwapVersion version
    ) external payable onlyMessageBus returns (bool) {
        if (version == SwapVersion.v3) {
            _executeDstSwapV3(_token, _amount, _srcChainId, _message);
        }
        if (version == SwapVersion.v2) {
            _executeDstSwapV2(_token, _amount, _srcChainId, _message);
        } else {
            _executeDstSwapInch(_token, _amount, _srcChainId, _message);
        }

        // always return true since swap failure is already handled in-place
        return true;
    }

    function _executeDstSwapInch(
        address _token,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message
    ) private {
        SwapRequestInch memory m = abi.decode((_message), (SwapRequestInch));
        require(_token == m.swap.path[0], "bridged token must be the same as the first token in destination swap path");
        bytes32 id = SwapBase._computeSwapRequestId(m.receiver, _srcChainId, uint64(block.chainid), _message);
        uint256 dstAmount;
        SwapStatus status = SwapStatus.Succeeded;

        if (m.swap.path.length > 1) {
            bool success;
            (success, dstAmount) = _trySwapInch(m.swap, _amount);
            if (success) {
                _sendToken(m.swap.path[m.swap.path.length - 1], dstAmount, m.receiver, m.nativeOut);
                status = SwapStatus.Succeeded;
            } else {
                // handle swap failure, send the received token directly to receiver
                _sendToken(_token, _amount, m.receiver, false);
                dstAmount = _amount;
                status = SwapStatus.Fallback;
            }
        } else {
            // no need to swap, directly send the bridged token to user
            _sendToken(m.swap.path[0], _amount, m.receiver, m.nativeOut);
            dstAmount = _amount;
            status = SwapStatus.Succeeded;
        }
        emit SwapRequestDone(id, dstAmount, status);
    }

    function _executeDstSwapV2(
        address _token,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message
    ) private {
        SwapRequestV2 memory m = abi.decode((_message), (SwapRequestV2));
        require(_token == m.swap.path[0], "bridged token must be the same as the first token in destination swap path");
        bytes32 id = SwapBase._computeSwapRequestId(m.receiver, _srcChainId, uint64(block.chainid), _message);
        uint256 dstAmount;
        SwapStatus status = SwapStatus.Succeeded;

        if (m.swap.path.length > 1) {
            bool success;
            (success, dstAmount) = _trySwapV2(m.swap, _amount);
            if (success) {
                _sendToken(m.swap.path[m.swap.path.length - 1], dstAmount, m.receiver, m.nativeOut);
                status = SwapStatus.Succeeded;
            } else {
                // handle swap failure, send the received token directly to receiver
                _sendToken(_token, _amount, m.receiver, false);
                dstAmount = _amount;
                status = SwapStatus.Fallback;
            }
        } else {
            // no need to swap, directly send the bridged token to user
            _sendToken(m.swap.path[0], _amount, m.receiver, m.nativeOut);
            dstAmount = _amount;
            status = SwapStatus.Succeeded;
        }
        emit SwapRequestDone(id, dstAmount, status);
    }

    function _executeDstSwapV3(
        address _token,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message
    ) private {
        SwapRequestV3 memory m = abi.decode((_message), (SwapRequestV3));
        require(_token == address(SwapBase._getFirstBytes20(m.swap.path)), "bridged token must be the same as the first token in destination swap path");
        bytes32 id = SwapBase._computeSwapRequestId(m.receiver, _srcChainId, uint64(block.chainid), _message);
        uint256 dstAmount;
        SwapStatus status = SwapStatus.Succeeded;

        if (m.swap.path.length > 20) {
            bool success;
            (success, dstAmount) = _trySwapV3(m.swap, _amount);
            if (success) {
                _sendToken(address(SwapBase._getLastBytes20(m.swap.path)), dstAmount, m.receiver, m.nativeOut);
                status = SwapStatus.Succeeded;
            } else {
                // handle swap failure, send the received token directly to receiver
                _sendToken(_token, _amount, m.receiver, false);
                dstAmount = _amount;
                status = SwapStatus.Fallback;
            }
        } else {
            // no need to swap, directly send the bridged token to user
            _sendToken(address(SwapBase._getFirstBytes20(m.swap.path)), _amount, m.receiver, m.nativeOut);
            dstAmount = _amount;
            status = SwapStatus.Succeeded;
        }
        emit SwapRequestDone(id, dstAmount, status);
    }

    /**
     * @notice called by MessageBus when the executeMessageWithTransfer call fails. does nothing but emitting a "fail" event
     * @param _srcChainId source chain ID
     * @param _message SwapRequestV2 message that defines the swap behavior on this destination chain
     */
    function executeMessageWithTransferFallback(
        address, // _sender (executor)
        address,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message
    ) external payable override onlyMessageBus returns (bool) {
        SwapRequestV2 memory m = abi.decode((_message), (SwapRequestV2));

        bytes32 id = SwapBase._computeSwapRequestId(m.receiver, _srcChainId, uint64(block.chainid), _message);
        _sendToken(m.swap.path[0], _amount, m.receiver, false);
        emit SwapRequestDone(id, 0, SwapStatus.Failed);
        // always return false to mark this transfer as failed since if this function is called then there nothing more
        // we can do in this app as the swap failures are already handled in executeMessageWithTransfer
        return false;
    }

    function executeMessageWithTransferRefund(
        address,
        uint256 _amount,
        bytes calldata _message
    ) external payable override onlyMessageBus returns (bool) {
        SwapRequestV2 memory m = abi.decode((_message), (SwapRequestV2));
        _sendToken(m.swap.path[m.swap.path.length - 1], _amount, m.receiver, false);
        return true;
    }

    function _sendToken(
        address _token,
        uint256 _amount,
        address _receiver,
        bool _nativeOut
    ) private {
        if (_nativeOut) {
            require(_token == nativeWrap, "token mismatch");
            IWETH(nativeWrap).withdraw(_amount);
            (bool sent, ) = _receiver.call{value: _amount, gas: 50000}(""); //
            require(sent, "failed to send native");
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
    }


    function setMinSwapAmount(uint256 _minSwapAmount) external onlyOwner {
        minSwapAmount = _minSwapAmount * 10**decimals;
    }

    function setRubicFee(uint256 _feeRubic) external onlyOwner {
        require(_feeRubic < 5000000);
        feeRubic = _feeRubic;
    }

    function setDecimalsUSD(uint8 _decimals) external onlyOwner {
        decimals = _decimals;
    }

    function setCryptoFee(uint64 _networkID, uint256 _amount) external onlyOwner {
        dstCryptoFee[_networkID] = _amount;
    }

    function setSupportedDex(address _dex, bool _enabled) external onlyOwner {
        supportedDex[_dex] = _enabled;
    }

    function sweepTokens(IERC20 token) external onlyOwner {
        token.transfer(msg.sender, token.balanceOf(address(this)));
    }

    function setNativeWrap(address _nativeWrap) external onlyOwner {
        nativeWrap = _nativeWrap;
    }

}