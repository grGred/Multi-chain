// SPDX-License-Identifier: MIT

pragma solidity >=0.8.9;

import '../message/apps/SwapBase.sol';

contract TestMessages is SwapBase {
    constructor() {}

    function getMessage(
        SwapInfoDest memory _dstSwap,
        address _receiver,
        uint64 _nonce,
        uint64 _dstChainId
    ) public pure returns (bytes memory) {
        bytes memory message = abi.encode(
            SwapRequestDest({
                swap: _dstSwap,
                receiver: _receiver,
                nonce: _nonce,
                dstChainId: _dstChainId
            })
        );
        return message;
    }

    function getID(
        address _receiver,
        uint64 _chainId,
        uint64 _dstChainId,
        SwapInfoDest memory _dstSwap,
        uint64 _nonce
    ) public pure returns (bytes32) {
        bytes memory message = abi.encode(
            SwapRequestDest({
                swap: _dstSwap,
                receiver: _receiver,
                nonce: _nonce,
                dstChainId: _dstChainId
            })
        );
        bytes32 id = SwapBase._computeSwapRequestId(_receiver, _chainId, _dstChainId, message);

        return id;
    }
}
