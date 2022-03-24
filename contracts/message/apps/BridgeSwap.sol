// SPDX-License-Identifier: MIT

pragma solidity >=0.8.9;

import "./SwapBase.sol";

contract TransferSwapV2 is SwapBase {
    using SafeERC20 for IERC20;

    event BridgeRequestSent(
        bytes32 id,
        uint64 dstChainId,
        uint256 srcAmount,
        address srcToken
    );

    function bridgeWithSwap(
        address _receiver,
        uint256 _amountIn,
        uint64 _dstChainId,
        address _srcBridgeToken,
        SwapInfoDest calldata _dstSwap,
        uint32 _maxBridgeSlippage,
        uint64 _nonce,
        bool _nativeOut
    ) external payable onlyEOA {
        // require(tokensForBridging.contains(_srcBridgeToken));
        IERC20(_srcBridgeToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amountIn
        );
        _crossChainBridgeWithSwap(
            _receiver,
            _amountIn,
            _dstChainId,
            _srcBridgeToken,
            _dstSwap,
            _maxBridgeSlippage,
            _nonce,
            _nativeOut,
            msg.value
        );
    }

    function _crossChainBridgeWithSwap(
        address _receiver,
        uint256 _amountIn,
        uint64 _dstChainId,
        address _srcBridgeToken,
        SwapInfoDest memory _dstSwap,
        uint32 _maxBridgeSlippage,
        uint64 _nonce,
        bool _nativeOut,
        uint256 _fee
    ) private {
        uint64 _chainId = uint64(block.chainid);
        require(_dstChainId != _chainId, "same chain id");
        require(
            _amountIn >= minSwapAmount,
            "amount must be greater than min swap amount"
        );
        require(_dstSwap.path.length > 0, "empty dst swap path");
        bytes memory message = abi.encode(
            SwapRequestDest({
                swap: _dstSwap,
                receiver: msg.sender,
                nonce: _nonce,
                nativeOut: _nativeOut
            })
        );
        bytes32 id = SwapBase._computeSwapRequestId(
            msg.sender,
            _chainId,
            _dstChainId,
            message
        );
        // bridge the intermediate token to destination chain along with the message
        // NOTE In production, it's better use a per-user per-transaction nonce so that it's less likely transferId collision
        // would happen at Bridge contract. Currently this nonce is a timestamp supplied by frontend
        _sendMessageWithBridge(
            _receiver,
            _srcBridgeToken,
            _amountIn,
            _dstChainId,
            _nonce,
            _maxBridgeSlippage,
            message,
            _fee
        );
        emit BridgeRequestSent(id, _dstChainId, _amountIn, _srcBridgeToken);
    }

    function _sendMessageWithBridge(
        address _receiver,
        address _srcBridgeToken,
        uint256 _amountIn,
        uint64 _dstChainId,
        uint64 _nonce,
        uint32 _maxBridgeSlippage,
        bytes memory _message,
        uint256 _fee
    ) private {
        // sends directly to msgBus
        sendMessageWithTransfer(
            _receiver,
            _srcBridgeToken,
            _amountIn * (1 - feeRubic / 1000000),
            _dstChainId,
            _nonce,
            _maxBridgeSlippage,
            _message,
            MessageSenderLib.BridgeType.Liquidity,
            _fee - dstCryptoFee[_dstChainId]
        );
    }
}
