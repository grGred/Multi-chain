pragma solidity >=0.8.9;

import "./SwapBase.sol";
import "../../interfaces/IWETH.sol";
import "../../interfaces/ISwapRouter.sol";


contract TransferSwapV3 is SwapBase {
    using SafeERC20 for IERC20;

    // emitted when requested dstChainId == srcChainId, no bridging
    event DirectSwapV3(
        bytes32 id,
        uint64 srcChainId,
        uint256 amountIn,
        address tokenIn,
        uint256 amountOut,
        address tokenOut
    );

    event SwapRequestSentV3(bytes32 id, uint64 dstChainId, uint256 srcAmount, address srcToken, address dstToken);
    event SwapRequestDoneV3(bytes32 id, uint256 dstAmount, SwapStatus status);

    function transferWithSwapV3Native(
        address _receiver,  // transfer swap contract in dst chain
        uint256 _amountIn,
        uint64 _dstChainId,
        SwapInfoV3 calldata _srcSwap,
        SwapInfoV3 calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        SwapVersion _version,
        uint64 _nonce,
        bool _nativeOut
    ) external payable onlyEOA {
        require(address(_getFirstBytes20(_srcSwap.path)) == nativeWrap, "token mismatch");
        require(msg.value >= _amountIn, "Amount insufficient");
        IWETH(nativeWrap).deposit{value: _amountIn}();
        _transferWithSwapV3(
            _receiver,
            _amountIn,
            _dstChainId,
            _srcSwap,
            _dstSwap,
            _maxBridgeSlippage,
            _nonce,
            _nativeOut,
            msg.value - _amountIn
        );
    }

    function transferWithSwapV3(
        address _receiver,  // transfer swap contract in dst chain
        uint256 _amountIn,
        uint64 _dstChainId,
        SwapInfoV3 calldata _srcSwap,
        SwapInfoV3 calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        SwapVersion _version,
        uint64 _nonce,
        bool _nativeOut
    ) external payable onlyEOA {
        IERC20(address(_getFirstBytes20(_srcSwap.path))).safeTransferFrom(msg.sender, address(this), _amountIn);
        _transferWithSwapV3(
            _receiver,
            _srcSwap.amountIn,
            _dstChainId,
            _srcSwap,
            _dstSwap,
            _maxBridgeSlippage,
            _version,
            _nonce,
            _nativeOut,
            msg.value
        );
    }

    /**
     * @notice Sends a cross-chain transfer via the liquidity pool-based bridge and sends a message specifying a wanted swap action on the
               destination chain via the message bus
     * @param _receiver the app contract that implements the MessageReceiver abstract contract
     *        NOTE not to be confused with the receiver field in SwapInfoV2 which is an EOA address of a user
     * @param _amountIn the input amount that the user wants to swap and/or bridge
     * @param _dstChainId destination chain ID
     * @param _srcSwap a struct containing swap related requirements
     * @param _dstSwap a struct containing swap related requirements
     * @param _maxBridgeSlippage the max acceptable slippage at bridge, given as percentage in point (pip). Eg. 5000 means 0.5%.
     *        Must be greater than minimalMaxSlippage. Receiver is guaranteed to receive at least (100% - max slippage percentage) * amount or the
     *        transfer can be refunded.
     * @param _fee the fee to pay to MessageBus.
     */
    function _transferWithSwapV3(
        address _receiver,
        uint256 _amountIn,
        uint64 _dstChainId,
        SwapInfoV3 memory _srcSwap,
        SwapInfoV3 memory _dstSwap,
        uint32 _maxBridgeSlippage,
        SwapVersion _version,
        uint64 _nonce,
        bool _nativeOut,
        uint256 _fee
    ) private {
        require(_srcSwap.path.length > 0, "empty src swap path");
        address srcTokenOut = address(_getLastBytes20(_srcSwap.path));

        uint64 chainId = uint64(block.chainid);
        //TODO: is it needed?
        require(_srcSwap.path.length > 20 || _dstChainId != chainId, "noop is not allowed"); // revert early to save gas

        uint256 srcAmtOut = _amountIn;

        // swap source token for intermediate token on the source DEX
        if (_srcSwap.path.length > 20) {
            bool success;
            (success, srcAmtOut) = _trySwapV3(_srcSwap, _amountIn);
            if (!success) revert("src swap failed");
        }

        require(srcAmtOut >= minSwapAmount, "amount must be greater than min swap amount");

        if (_dstChainId == chainId) {
            _directSendV3(_receiver, _amountIn, chainId, _srcSwap, _nonce, srcTokenOut, srcAmtOut);
        } else {
            _crossChainTransferWithSwapV3(
                _receiver,
                _amountIn,
                chainId,
                _dstChainId,
                _srcSwap,
                _dstSwap,
                _maxBridgeSlippage,
                _version,
                _nonce,
                _nativeOut,
                _fee,
                srcTokenOut,
                srcAmtOut
            );
        }
    }

    function _directSendV3(
        address _receiver, //TODO: change to EOA?
        uint256 _amountIn,
        uint64 _chainId,
        SwapInfoV3 memory _srcSwap,
        uint64 _nonce,
        address srcTokenOut,
        uint256 srcAmtOut
    ) private {
        // no need to bridge, directly send the tokens to user
        IERC20(srcTokenOut).safeTransfer(_receiver, srcAmtOut);
        // use uint64 for chainid to be consistent with other components in the system
        bytes32 id = keccak256(abi.encode(msg.sender, _chainId, _receiver, _nonce, _srcSwap));
        emit DirectSwapV3(id, _chainId, _amountIn, address(_getFirstBytes20(_srcSwap.path)), srcAmtOut, srcTokenOut);
    }

    function _crossChainTransferWithSwapV3(
        address _receiver,
        uint256 _amountIn,
        uint64 _chainId,
        uint64 _dstChainId,
        SwapInfoV3 memory _srcSwap,
        SwapInfoV3 memory _dstSwap, // TODO: change
        uint32 _maxBridgeSlippage,
        SwapVersion _version,
        uint64 _nonce,
        bool _nativeOut,
        uint256 _fee,
        address srcTokenOut,
        uint256 srcAmtOut
    ) private {
        require(_dstSwap.path.length > 0, "empty dst swap path");
        bytes memory message = abi.encode(
            SwapRequestV3({swap: _dstSwap, receiver: msg.sender, nonce: _nonce, nativeOut: _nativeOut, version: _version})
        );
        bytes32 id = _computeSwapRequestId(msg.sender, _chainId, _dstChainId, message);
        // bridge the intermediate token to destination chain along with the message
        // NOTE In production, it's better use a per-user per-transaction nonce so that it's less likely transferId collision
        // would happen at Bridge contract. Currently this nonce is a timestamp supplied by frontend
        _sendMessageWithTransferV3(
            _receiver,
            srcTokenOut,
            srcAmtOut,
            _dstChainId,
            _nonce,
            _maxBridgeSlippage,
            message,
            _fee
        );
        emit SwapRequestSentV3(id, _dstChainId, _amountIn, address(_getFirstBytes20(_srcSwap.path)), address(_getLastBytes20(_dstSwap.path)));
    }

    function _sendMessageWithTransferV3(
        address _receiver,
        address srcTokenOut,
        uint256 srcAmtOut,
        uint64 _dstChainId,
        uint64 _nonce,
        uint32 _maxBridgeSlippage,
        bytes memory _message,
        uint256 _fee
    ) private {
        // sends directly to msgBus
        sendMessageWithTransfer(
            _receiver,
            srcTokenOut,
            srcAmtOut * (1 - feeRubic / 1000000),
            _dstChainId,
            _nonce,
            _maxBridgeSlippage,
            _message,
            MessageSenderLib.BridgeType.Liquidity,
            _fee - dstCryptoFee[_dstChainId]
        );
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
        address, // _sender
        address _token,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message
    ) external payable override onlyMessageBus returns (bool) {
        SwapRequestV3 memory m = abi.decode((_message), (SwapRequestV3));
        require(_token == address(_getFirstBytes20(m.swap.path)), "bridged token must be the same as the first token in destination swap path");
        bytes32 id = _computeSwapRequestId(m.receiver, _srcChainId, uint64(block.chainid), _message);
        uint256 dstAmount;
        SwapStatus status = SwapStatus.Succeeded;

        if (m.swap.path.length > 20) {
            bool success;
            (success, dstAmount) = _trySwapV3(m.swap, _amount);
            if (success) {
                _sendToken(address(_getLastBytes20(m.swap.path)), dstAmount, m.receiver, m.nativeOut);
                status = SwapStatus.Succeeded;
            } else {
                // handle swap failure, send the received token directly to receiver
                _sendToken(_token, _amount, m.receiver, false);
                dstAmount = _amount;
                status = SwapStatus.Fallback;
            }
        } else {
            // no need to swap, directly send the bridged token to user
            _sendToken(address(_getFirstBytes20(m.swap.path)), _amount, m.receiver, m.nativeOut);
            dstAmount = _amount;
            status = SwapStatus.Succeeded;
        }
        emit SwapRequestDoneV3(id, dstAmount, status);
        // always return true since swap failure is already handled in-place
        return true;
    }

    function _trySwapV3(SwapInfoV3 memory _swap, uint256 _amount) private returns (bool ok, uint256 amountOut) {
        uint256 zero;
        if (!supportedDex[_swap.dex]) {
            return (false, zero);
        }
        IERC20(address(_getFirstBytes20(_swap.path))).safeIncreaseAllowance(_swap.dex, _amount);
        try
            IUniswapRouterV3(_swap.dex).exactInput(
                _swap.path,
                address(this),
                _swap.deadline,
                _amount,
                _swap.amountOutMinimum
            )
        returns (uint256 _amountOut) {
            return (true, _amountOut);
        } catch {
            return (false, zero);
        }
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

    function _computeSwapRequestId(
        address _sender,
        uint64 _srcChainId,
        uint64 _dstChainId,
        bytes memory _message
    ) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(_sender, _srcChainId, _dstChainId, _message));
    }

}
