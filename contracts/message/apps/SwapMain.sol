// SPDX-License-Identifier: MIT

pragma solidity >=0.8.9;

import "./TransferSwapV2.sol";
import "./TransferSwapV3.sol";
import "./TransferSwapInch.sol";
import "./BridgeSwap.sol";

contract SwapMain is TransferSwapV2, TransferSwapV3, TransferSwapInch, BridgeSwap {
    using SafeERC20 for IERC20;
    event SwapRequestDone(bytes32 id, uint256 dstAmount, SwapStatus status);

    constructor(
        address _messageBus,
        address _supportedDex,
        address _nativeWrap
    ) {
        messageBus = _messageBus;
        supportedDex[_supportedDex] = true;
        nativeWrap = _nativeWrap;
        dstCryptoFee[43114] = 10000000;
        // minSwapAmount[bridgeToken] = 8 * 10**decimals;
        feeRubic = 160000; // 0.16%
    }

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
        address,
        address _token,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message
    ) external payable override returns (bool) {
        SwapRequestDest memory m = abi.decode((_message), (SwapRequestDest));
        bytes32 id = _computeSwapRequestId(
            m.receiver,
            _srcChainId,
            uint64(block.chainid),
            _message
        );
        if (m.swap.version == SwapVersion.v3) {
            _executeDstSwapV3(_token, _amount, id, m);
        }
        if (m.swap.version == SwapVersion.bridge) {
            _executeDstBridge(_token, _amount, id, m);
        }
        if (m.swap.version == SwapVersion.v2) {
            _executeDstSwapV2(_token, _amount, id, m);
        } else {
            _executeDstSwapInch(_token, _amount, id, m);
        }
        // always return true since swap failure is already handled in-place
        return true;
    }

    function _executeDstSwapInch(
        address _token,
        uint256 _amount,
        bytes32 _id,
        SwapRequestDest memory _msgDst
    ) private {
        require(
            _token == _msgDst.swap.path[0],
            "bridged token must be the same as the first token in destination swap path"
        );
        require(_msgDst.swap.path.length > 1, "dst swap expected");

        uint256 dstAmount;
        SwapStatus status = SwapStatus.Succeeded;

        SwapInfoInch memory _dstSwap = SwapInfoInch({
            dex: _msgDst.swap.dex,
            path: _msgDst.swap.path,
            data: _msgDst.swap.data,
            amountOutMinimum: _msgDst.swap.amountOutMinimum
        });

        bool success;
        if (_dstSwap.path[0] == nativeWrap) {
            (success, dstAmount) = _trySwapNativeInch(_dstSwap, _amount);
        } else {
            (success, dstAmount) = _trySwapInch(_dstSwap, _amount);
        }

        if (success) {
            _sendToken(
                _dstSwap.path[_dstSwap.path.length - 1],
                dstAmount,
                _msgDst.receiver,
                _msgDst.nativeOut
            );
            status = SwapStatus.Succeeded;
        } else {
            // handle swap failure, send the received token directly to receiver
            _sendToken(_token, _amount, _msgDst.receiver, false);
            dstAmount = _amount;
            status = SwapStatus.Fallback;
        }

        emit SwapRequestDone(_id, dstAmount, status);
    }

    // no need to swap, directly send the bridged token to user
    function _executeDstBridge(
        address _token,
        uint256 _amount,
        bytes32 _id,
        SwapRequestDest memory _msgDst
    ) private {
        require(
            _token == _msgDst.swap.path[0],
            "bridged token must be the same as the first token in destination swap path"
        );
        require(_msgDst.swap.path.length == 1, "dst bridge expected");
        _sendToken(
            _msgDst.swap.path[0],
            _amount,
            _msgDst.receiver,
            _msgDst.nativeOut
        );
        SwapStatus status = SwapStatus.Succeeded;
        emit SwapRequestDone(_id, _amount, status);
    }

    function _executeDstSwapV2(
        address _token,
        uint256 _amount,
        bytes32 _id,
        SwapRequestDest memory _msgDst
    ) private {
        // TODO add as modifier
        require(
            _token == _msgDst.swap.path[0],
            "bridged token must be the same as the first token in destination swap path"
        );
        // TODO add as modifier
        require(_msgDst.swap.path.length > 1, "dst swap expected");

        uint256 dstAmount;
        SwapStatus status = SwapStatus.Succeeded;

        SwapInfoV2 memory _dstSwap = SwapInfoV2({
            dex: _msgDst.swap.dex,
            path: _msgDst.swap.path,
            deadline: _msgDst.swap.deadline,
            amountOutMinimum: _msgDst.swap.amountOutMinimum
        });

        bool success;
        (success, dstAmount) = _trySwapV2(_dstSwap, _amount);
        if (success) {
            _sendToken(
                _dstSwap.path[_dstSwap.path.length - 1],
                dstAmount,
                _msgDst.receiver,
                _msgDst.nativeOut
            );
            status = SwapStatus.Succeeded;
        } else {
            // handle swap failure, send the received token directly to receiver
            _sendToken(_token, _amount, _msgDst.receiver, false);
            dstAmount = _amount;
            status = SwapStatus.Fallback;
        }

        status = SwapStatus.Succeeded;

        emit SwapRequestDone(_id, dstAmount, status);
    }

    function _executeDstSwapV3(
        address _token,
        uint256 _amount,
        bytes32 _id,
        SwapRequestDest memory _msgDst
    ) private {
        require(
            _token == address(_getFirstBytes20(_msgDst.swap.pathV3)),
            "bridged token must be the same as the first token in destination swap path"
        );
        require(_msgDst.swap.pathV3.length > 20, "dst swap expected");

        uint256 dstAmount;
        SwapStatus status = SwapStatus.Succeeded;

        SwapInfoV3 memory _dstSwap = SwapInfoV3({
            dex: _msgDst.swap.dex,
            path: _msgDst.swap.pathV3,
            deadline: _msgDst.swap.deadline,
            amountOutMinimum: _msgDst.swap.amountOutMinimum
        });

        bool success;
        (success, dstAmount) = _trySwapV3(_dstSwap, _amount);
        if (success) {
            _sendToken(
                address(_getLastBytes20(_dstSwap.path)),
                dstAmount,
                _msgDst.receiver,
                _msgDst.nativeOut
            );
            status = SwapStatus.Succeeded;
        } else {
            // handle swap failure, send the received token directly to receiver
            _sendToken(_token, _amount, _msgDst.receiver, false);
            dstAmount = _amount;
            status = SwapStatus.Fallback;
        }

        emit SwapRequestDone(_id, dstAmount, status);
    }

    /**
     * @notice called by MessageBus when the executeMessageWithTransfer call fails. does nothing but emitting a "fail" event
     * @param _srcChainId source chain ID
     * @param _message SwapRequestDest message that defines the swap behavior on this destination chain
     */
    function executeMessageWithTransferFallback(
        address, // _sender (executor)
        address,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message
    ) external payable override returns (bool) {
        SwapRequestDest memory m = abi.decode((_message), (SwapRequestDest));

        bytes32 id = _computeSwapRequestId(
            m.receiver,
            _srcChainId,
            uint64(block.chainid),
            _message
        );
        if (m.swap.version == SwapVersion.v3) {
            _sendToken(
                address(_getFirstBytes20(m.swap.pathV3)),
                _amount,
                m.receiver,
                false
            );
        } else {
            _sendToken(m.swap.path[0], _amount, m.receiver, false);
        }
        emit SwapRequestDone(id, 0, SwapStatus.Failed);
        // always return false to mark this transfer as failed since if this function is called then there nothing more
        // we can do in this app as the swap failures are already handled in executeMessageWithTransfer
        return false;
    }

    function executeMessageWithTransferRefund(
        address,
        uint256 _amount,
        bytes calldata _message
    ) external payable override returns (bool) {
        SwapRequestDest memory m = abi.decode((_message), (SwapRequestDest));
        if (m.swap.version == SwapVersion.v3) {
            _sendToken(
                address(_getLastBytes20(m.swap.pathV3)),
                _amount,
                m.receiver,
                false
            );
        } else {
            _sendToken(
                m.swap.path[m.swap.path.length - 1],
                _amount,
                m.receiver,
                false
            );
        }

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
    // TODO decimals are not needed, add minAmount for different tokens

    function setCryptoFee(uint64 _networkID, uint256 _amount)
        external
        onlyOwner
    {
        dstCryptoFee[_networkID] = _amount;
    }

    function setSupportedDex(address _dex, bool _enabled) external onlyOwner {
        supportedDex[_dex] = _enabled;
    }

    function sweepTokens(IERC20 token) external onlyOwner {
        token.transfer(msg.sender, token.balanceOf(address(this)));
    }
    // TODO comission must be represnted with code

    function setNativeWrap(address _nativeWrap) external onlyOwner {
        nativeWrap = _nativeWrap;
    }
}
