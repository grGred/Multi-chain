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

    event SwapRequestSentV3(bytes32 id, uint64 dstChainId, uint256 srcAmount, address srcToken);
    event SwapRequestDoneV3(bytes32 id, uint256 dstAmount, SwapStatus status);

    function transferWithSwapV3Native(
        address _receiver,  // transfer swap contract in dst chain
        uint256 _amountIn,
        uint64 _dstChainId,
        SwapInfoV3 calldata _srcSwap,
        SwapInfoDest calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        uint64 _nonce,
        bool _nativeOut
    ) external payable onlyEOA {
        require(address(SwapBase._getFirstBytes20(_srcSwap.path)) == nativeWrap, "token mismatch");
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
        SwapInfoDest calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        uint64 _nonce,
        bool _nativeOut
    ) external payable onlyEOA {
        IERC20(address(SwapBase._getFirstBytes20(_srcSwap.path))).safeTransferFrom(msg.sender, address(this), _amountIn);
        _transferWithSwapV3(
            _receiver,
            _amountIn,
            _dstChainId,
            _srcSwap,
            _dstSwap,
            _maxBridgeSlippage,
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
        SwapInfoDest memory _dstSwap,
        uint32 _maxBridgeSlippage,
        uint64 _nonce,
        bool _nativeOut,
        uint256 _fee
    ) private {
        require(_srcSwap.path.length > 0, "empty src swap path");
        address srcTokenOut = address(SwapBase._getLastBytes20(_srcSwap.path));

        uint64 chainId = uint64(block.chainid);
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
                _nonce,
                _nativeOut,
                _fee,
                srcTokenOut,
                srcAmtOut
            );
        }
    }

    function _directSendV3(
        address _receiver,
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
        emit DirectSwapV3(id, _chainId, _amountIn, address(SwapBase._getFirstBytes20(_srcSwap.path)), srcAmtOut, srcTokenOut);
    }

    function _crossChainTransferWithSwapV3(
        address _receiver,
        uint256 _amountIn,
        uint64 _chainId,
        uint64 _dstChainId,
        SwapInfoV3 memory _srcSwap,
        SwapInfoDest memory _dstSwap,
        uint32 _maxBridgeSlippage,
        uint64 _nonce,
        bool _nativeOut,
        uint256 _fee,
        address srcTokenOut,
        uint256 srcAmtOut
    ) private {
        require(_dstSwap.path.length > 0, "empty dst swap path");
        bytes memory message = abi.encode(
            SwapRequestDest({swap: _dstSwap, receiver: msg.sender, nonce: _nonce, nativeOut: _nativeOut})
        );
        bytes32 id = SwapBase._computeSwapRequestId(msg.sender, _chainId, _dstChainId, message);
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
        emit SwapRequestSentV3(id, _dstChainId, _amountIn, address(SwapBase._getFirstBytes20(_srcSwap.path)));
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

    function _trySwapV3(SwapInfoV3 memory _swap, uint256 _amount) internal returns (bool ok, uint256 amountOut) {
        uint256 zero;
        if (!supportedDex[_swap.dex]) {
            return (false, zero);
        }
        IERC20(address(SwapBase._getFirstBytes20(_swap.path))).safeIncreaseAllowance(_swap.dex, _amount);

        IUniswapRouterV3.ExactInputParams memory paramsV3 = IUniswapRouterV3.ExactInputParams(
            _swap.path,
            address(this),
            _swap.deadline,
            _amount,
            _swap.amountOutMinimum
        );
        try
            IUniswapRouterV3(_swap.dex).exactInput(paramsV3)
        returns (uint256 _amountOut) {
            return (true, _amountOut);
        } catch {
            return (false, zero);
        }
    }

}
