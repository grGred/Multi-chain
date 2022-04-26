// SPDX-License-Identifier: MIT

pragma solidity >=0.8.9;

import './SwapBase.sol';

contract TransferSwapInch is SwapBase {
    using Address for address payable;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    event DirectSwapInch(
        bytes32 id,
        uint64 srcChainId,
        uint256 amountIn,
        address tokenIn,
        uint256 amountOut,
        address tokenOut
    );

    event SwapRequestSentInch(bytes32 id, uint64 dstChainId, uint256 srcAmount, address srcToken);

    function transferWithSwapInchNative(
        address _receiver,
        uint256 _amountIn,
        uint64 _dstChainId,
        SwapInfoInch calldata _srcSwap,
        SwapInfoDest calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        bool _nativeOut
    ) external payable onlyEOA whenNotPaused {
        require(_srcSwap.path[0] == nativeWrap, 'token mismatch');
        require(msg.value >= _amountIn, 'Amount insufficient');
        IWETH(nativeWrap).deposit{value: _amountIn}();

        uint256 _fee = _calculateCryptoFee(msg.value - _amountIn, _dstChainId);

        _transferWithSwapInch(
            _receiver,
            _amountIn,
            _dstChainId,
            _srcSwap,
            _dstSwap,
            _maxBridgeSlippage,
            _nativeOut,
            _fee
        );
    }

    function transferWithSwapInch(
        address _receiver,
        uint256 _amountIn,
        uint64 _dstChainId,
        SwapInfoInch calldata _srcSwap,
        SwapInfoDest calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        bool _nativeOut
    ) external payable onlyEOA whenNotPaused {
        IERC20(_srcSwap.path[0]).safeTransferFrom(msg.sender, address(this), _amountIn);

        uint256 _fee = _calculateCryptoFee(msg.value, _dstChainId);

        _transferWithSwapInch(
            _receiver,
            _amountIn,
            _dstChainId,
            _srcSwap,
            _dstSwap,
            _maxBridgeSlippage,
            _nativeOut,
            _fee
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
        SwapInfoDest memory _dstSwap,
        uint32 _maxBridgeSlippage,
        bool _nativeOut,
        uint256 _fee
    ) private {
        nonce += 1;
        uint64 chainId = uint64(block.chainid);

        require(_srcSwap.path.length > 1 && _dstChainId != chainId, 'empty src swap path or same chain id');

        address srcTokenOut = _srcSwap.path[_srcSwap.path.length - 1];
        uint256 srcAmtOut = _amountIn;

        // swap source token for intermediate token on the source DEX
        if (_srcSwap.path.length > 1) {
            bool success;
            if (_srcSwap.path[0] == nativeWrap) {
                (success, srcAmtOut) = _trySwapNativeInch(_srcSwap, _amountIn);
            } else {
                (success, srcAmtOut) = _trySwapInch(_srcSwap, _amountIn);
            }
            if (!success) revert('src swap failed');
        }

        require(
            srcAmtOut >= minSwapAmount[_srcSwap.path[_srcSwap.path.length - 1]],
            'amount must be greater than min swap amount'
        );

        _crossChainTransferWithSwapInch(
            _receiver,
            _amountIn,
            chainId,
            _dstChainId,
            _srcSwap,
            _dstSwap,
            _maxBridgeSlippage,
            nonce,
            _nativeOut,
            _fee,
            srcTokenOut,
            srcAmtOut
        );
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
        emit DirectSwapInch(id, _chainId, _amountIn, _srcSwap.path[0], srcAmtOut, srcTokenOut);
    }

    function _crossChainTransferWithSwapInch(
        address _receiver,
        uint256 _amountIn,
        uint64 _chainId,
        uint64 _dstChainId,
        SwapInfoInch memory _srcSwap,
        SwapInfoDest memory _dstSwap,
        uint32 _maxBridgeSlippage,
        uint64 _nonce,
        bool _nativeOut,
        uint256 _fee,
        address srcTokenOut,
        uint256 srcAmtOut
    ) private {
        require(_dstSwap.path.length > 0, 'empty dst swap path');
        bytes memory message = abi.encode(
            SwapRequestDest({swap: _dstSwap, receiver: msg.sender, nonce: nonce, nativeOut: _nativeOut, dstChainId: _dstChainId})
        );
        bytes32 id = _computeSwapRequestId(msg.sender, _chainId, _dstChainId, message);

        sendMessageWithTransfer(
            _receiver,
            srcTokenOut,
            srcAmtOut,
            _dstChainId,
            _nonce,
            _maxBridgeSlippage,
            message,
            MsgDataTypes.BridgeSendType.Liquidity,
            _fee
        );
        emit SwapRequestSentInch(id, _dstChainId, _amountIn, _srcSwap.path[0]);
    }

    function _trySwapNativeInch(SwapInfoInch memory _swap, uint256 _amount)
        internal
        returns (bool ok, uint256 amountOut)
    {
        if (!supportedDEXes.contains(_swap.dex)) {
            return (false, 0);
        }

        smartApprove(IERC20(_swap.path[0]), _amount, _swap.dex);

        IERC20 Transit = IERC20(_swap.path[_swap.path.length - 1]);
        uint256 transitBalanceBefore = Transit.balanceOf(address(this));

        Address.functionCallWithValue(_swap.dex, _swap.data, _amount);

        uint256 balanceDif = Transit.balanceOf(address(this)) - transitBalanceBefore;

        if (balanceDif >= _swap.amountOutMinimum) {
            return (true, balanceDif);
        }

        return (false, 0);
    }

    function _trySwapInch(SwapInfoInch memory _swap, uint256 _amount) internal returns (bool ok, uint256 amountOut) {
        if (!supportedDEXes.contains(_swap.dex)) {
            return (false, 0);
        }

        smartApprove(IERC20(_swap.path[0]), _amount, _swap.dex);

        IERC20 Transit = IERC20(_swap.path[_swap.path.length - 1]);
        uint256 transitBalanceBefore = Transit.balanceOf(address(this));

        Address.functionCall(_swap.dex, _swap.data);

        uint256 balanceDif = Transit.balanceOf(address(this)) - transitBalanceBefore;

        if (balanceDif >= _swap.amountOutMinimum) {
            return (true, balanceDif);
        }

        return (false, 0);
    }
}
