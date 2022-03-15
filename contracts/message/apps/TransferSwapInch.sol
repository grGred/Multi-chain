pragma solidity >=0.8.9;

import "./SwapBase.sol";
import "../../interfaces/IWETH.sol";
import "../../interfaces/ISwapRouter.sol";

contract TransferSwapInch is SwapBase {
    using SafeERC20 for IERC20;

    // emitted when requested dstChainId == srcChainId, no bridging
    event DirectSwap(
        bytes32 id,
        uint64 srcChainId,
        uint256 amountIn,
        address tokenIn,
        uint256 amountOut,
        address tokenOut
    );

    event SwapRequestSentInch(bytes32 id, uint64 dstChainId, uint256 srcAmount, address srcToken, address dstToken);
    event SwapRequestDone(bytes32 id, uint256 dstAmount, SwapStatus status);

    function transferWithSwapInchNative(
        address _receiver,  // transfer swap contract in dst chain
        uint256 _amountIn,
        uint64 _dstChainId,
        SwapInfoInch calldata _srcSwap,
        SwapInfoInch calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        SwapVersion _version,
        uint64 _nonce,
        bool _nativeOut
    ) external payable onlyEOA {
        require(address(_getFirstBytes20(_srcSwap.path)) == nativeWrap, "token mismatch");
        require(msg.value >= _amountIn, "Amount insufficient");
        IWETH(nativeWrap).deposit{value: _amountIn}();
        _transferWithSwapInch(
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

    function transferWithSwapInch(
        address _receiver,  // transfer swap contract in dst chain
        uint256 _amountIn,
        uint64 _dstChainId,
        SwapInfoInch calldata _srcSwap,
        SwapInfoInch calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        SwapVersion _version,
        uint64 _nonce,
        bool _nativeOut
    ) external payable onlyEOA {
        IERC20(address(_getFirstBytes20(_srcSwap.path))).safeTransferFrom(msg.sender, address(this), _amountIn);
        _transferWithSwapInch(
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
    function _transferWithSwapInch(
        address _receiver,
        uint256 _amountIn,
        uint64 _dstChainId,
        SwapInfoInch memory _srcSwap,
        SwapInfoInch memory _dstSwap,
        uint32 _maxBridgeSlippage,
        SwapVersion _version,
        uint64 _nonce,
        bool _nativeOut,
        uint256 _fee
    ) private {
        require(_srcSwap.path.length > 0, "empty src swap path");
        address srcTokenOut = address(_getLastBytes20(_srcSwap.path));

        uint64 chainId = uint64(block.chainid);
        require(_srcSwap.path.length > 20 || _dstChainId != chainId, "noop is not allowed"); // revert early to save gas

        uint256 srcAmtOut = _amountIn;

        // swap source token for intermediate token on the source DEX
        if (_srcSwap.path.length > 20) {
            bool success;
            (success, srcAmtOut) = _trySwapInch(_srcSwap, _amountIn);
            if (!success) revert("src swap failed");
        }

        require(srcAmtOut >= minSwapAmount, "amount must be greater than min swap amount");

        if (_dstChainId == chainId) {
            _directSendInch(_receiver, _amountIn, chainId, _srcSwap, _nonce, srcTokenOut, srcAmtOut);
        } else {
            _crossChainTransferWithSwapInch(
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

    function _directSendInch(
        address _receiver,
        uint256 _amountIn,
        uint64 _chainId,
        SwapInfoInch memory _srcSwap,
        uint64 _nonce,
        address srcTokenOut,
        uint256 srcAmtOut
    ) private {
        // no need to bridge, directly send the tokens to user
        IERC20(srcTokenOut).safeTransfer(_receiver, srcAmtOut);
        // use uint64 for chainid to be consistent with other components in the system
        bytes32 id = keccak256(abi.encode(msg.sender, _chainId, _receiver, _nonce, _srcSwap));
        emit DirectSwap(id, _chainId, _amountIn, _srcSwap.path[0], srcAmtOut, srcTokenOut);
    }

    function _crossChainTransferWithSwapInch(
        address _receiver,
        uint256 _amountIn,
        uint64 _chainId,
        uint64 _dstChainId,
        SwapInfoInch memory _srcSwap,
        SwapInfoInch memory _dstSwap, // TODO: change
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
            SwapRequestInch({swap: _dstSwap, receiver: msg.sender, nonce: _nonce, nativeOut: _nativeOut, version: _version})
        );
        bytes32 id = _computeSwapRequestId(msg.sender, _chainId, _dstChainId, message);
        // bridge the intermediate token to destination chain along with the message
        // NOTE In production, it's better use a per-user per-transaction nonce so that it's less likely transferId collision
        // would happen at Bridge contract. Currently this nonce is a timestamp supplied by frontend
        _sendMessageWithTransferInch(
            _receiver,
            srcTokenOut,
            srcAmtOut,
            _dstChainId,
            _nonce,
            _maxBridgeSlippage,
            message,
            _fee
        );
        emit SwapRequestSent(id, _dstChainId, _amountIn, _srcSwap.path[0], _dstSwap.path[_dstSwap.path.length - 1]);
    }

    function _sendMessageWithTransferInch(
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

    function _trySwapInch(SwapInfoInch memory _swap, uint256 _amount) private returns (bool ok, uint256 amountOut) {
        uint256 zero;
        if (!supportedDex[_swap.dex]) {
            return (false, zero);
        }
        IERC20(_swap.path[0]).safeIncreaseAllowance(_swap.dex, _amount);
        try
            IUniswapV2(_swap.dex).swapExactTokensForTokens(
                _amount,
                _swap.minRecvAmt,
                _swap.path,
                address(this),
                _swap.deadline
            )
        returns (uint256[] memory amounts) {
            return (true, amounts[amounts.length - 1]);
        } catch {
            return (false, zero);
        }
    }

    function _sendTokenInch(
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
