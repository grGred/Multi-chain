// SPDX-License-Identifier: MIT

pragma solidity >=0.8.9;

import './SwapBase.sol';

contract BridgeSwap is SwapBase {
    using SafeERC20 for IERC20;

    event BridgeRequestSent(bytes32 id, uint64 dstChainId, uint256 srcAmount, address srcToken);

    function bridgeWithSwap(
        address _receiver,
        uint256 _amountIn,
        uint64 _dstChainId,
        address _srcBridgeToken,
        SwapInfoDest calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        bool _nativeOut
    ) external payable onlyEOA {
        IERC20(_srcBridgeToken).safeTransferFrom(msg.sender, address(this), _amountIn);

        uint256 _fee = _calculateCryptoFee(msg.value, _dstChainId);

        _crossChainBridgeWithSwap(
            _receiver,
            _amountIn,
            _dstChainId,
            _srcBridgeToken,
            _dstSwap,
            _maxBridgeSlippage,
            _nativeOut,
            _fee
        );
    }

    function bridgeWithSwapNative(
        address _receiver,
        uint256 _amountIn,
        uint64 _dstChainId,
        address _srcBridgeToken,
        SwapInfoDest calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        bool _nativeOut
    ) external payable onlyEOA {
        require(_srcBridgeToken == nativeWrap, 'token mismatch');
        require(msg.value >= _amountIn, 'Amount insufficient');
        IWETH(nativeWrap).deposit{value: _amountIn}();

        uint256 _fee = _calculateCryptoFee(msg.value - _amountIn, _dstChainId);

        _crossChainBridgeWithSwap(
            _receiver,
            _amountIn,
            _dstChainId,
            _srcBridgeToken,
            _dstSwap,
            _maxBridgeSlippage,
            _nativeOut,
            _fee
        );
    }

    function _crossChainBridgeWithSwap(
        address _receiver,
        uint256 _amountIn,
        uint64 _dstChainId,
        address _srcBridgeToken,
        SwapInfoDest calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        bool _nativeOut,
        uint256 _fee
    ) private {
        nonce += 1;
        uint64 _chainId = uint64(block.chainid);
        require(_dstChainId != _chainId, 'same chain id');

        require(_amountIn >= minSwapAmount[_srcBridgeToken], 'amount must be greater than min swap amount');
        require(_amountIn <= maxSwapAmount[_srcBridgeToken], 'amount must be lower than max swap amount');

        require(_dstSwap.path.length > 0, 'empty dst swap path');
        bytes memory message = abi.encode(
            SwapRequestDest({
                swap: _dstSwap,
                receiver: msg.sender,
                nonce: nonce,
                nativeOut: _nativeOut,
                dstChainId: _dstChainId
            })
        );
        bytes32 id = _computeSwapRequestId(msg.sender, _chainId, _dstChainId, message);

        sendMessageWithTransfer(
            _receiver,
            _srcBridgeToken,
            _amountIn,
            _dstChainId,
            nonce,
            _maxBridgeSlippage,
            message,
            MsgDataTypes.BridgeSendType.Liquidity,
            _fee
        );
        emit BridgeRequestSent(id, _dstChainId, _amountIn, _srcBridgeToken);
    }
}
