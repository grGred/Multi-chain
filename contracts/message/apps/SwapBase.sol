// SPDX-License-Identifier: MIT

pragma solidity >=0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../framework/MessageBusAddress.sol";
import "../framework/MessageSenderApp.sol";
import "../framework/MessageReceiverApp.sol";
import "../../interfaces/IWETH.sol";

contract SwapBase is MessageSenderApp, MessageReceiverApp {
    using SafeERC20 for IERC20;
    mapping(address => bool) supportedDex;
    mapping(uint64 => uint256) public dstCryptoFee;

    // erc20 wrap of gas token of this chain, eg. WETH
    address public nativeWrap;
    address public rubicFeeReciever = 0x0000006f0994c53C5D63E72dfA8Cf38412E874A4;

    uint256 public minSwapAmount;
    uint256 public feeRubic; // 1m is 100%
    uint8 public decimals = 18;

    modifier onlyEOA() {
        require(msg.sender == tx.origin, "Not EOA");
        _;
    }

    // ============== struct for V2 like dexes ==============

    struct SwapInfoV2 {
        address dex; // the DEX to use for the swap
        // if this array has only one element, it means no need to swap
        address[] path;
        // the following fields are only needed if path.length > 1
        uint256 deadline; // deadline for the swap
        uint256 amountOutMinimum; // minimum receive amount for the swap
    }

    // ============== struct for V3 like dexes ==============

    struct SwapInfoV3 {
        address dex; // the DEX to use for the swap
        bytes path;
        uint256 deadline;
        uint256 amountOutMinimum;
    }

    // ============== struct for inch swap ==============

    struct SwapInfoInch {
        address dex;
        // path is tokenIn, tokenOut
        address[] path;
        bytes data;
        uint256 amountOutMinimum;
    }

    // ============== struct dstSwap ==============
    // This is needed to make v2 -> SGN -> v3 swaps and etc.

    struct SwapInfoDest {
        address dex; // dex address
        address[] path; // path address for v2 and inch
        bytes pathV3; // path address for v3
        uint256 deadline; // for v2 and v3
        bytes data; // for inch only
        uint256 amountOutMinimum;
        SwapVersion version; // identifies swap type
    }
    // TODO bytes pathV3 can be used for inch message

    struct SwapRequestDest {
        SwapInfoDest swap;
        address receiver; // EOA
        uint64 nonce;
        bool nativeOut;
    }

    enum SwapVersion {
        inch,
        v2,
        v3,
        bridge
    }

    enum SwapStatus {
        Null,
        Succeeded,
        Failed,
        Fallback
    }

    // returns address of first token for V3
    function _getFirstBytes20(bytes memory input)
        internal
        pure
        returns (bytes20 result)
    {
        assembly {
            result := mload(add(input, 32))
        }
    }

    // returns address of tokenOut for V3
    function _getLastBytes20(bytes memory input)
        internal
        pure
        returns (bytes20 result)
    {
        uint256 offset = input.length + 12;
        assembly {
            result := mload(add(input, offset))
        }
    }

    function _computeSwapRequestId(
        address _sender,
        uint64 _srcChainId,
        uint64 _dstChainId,
        bytes memory _message
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(_sender, _srcChainId, _dstChainId, _message)
            );
    }

    function _sendFee(address _bridgeToken, uint256 _srcAmtOut, uint256 _fee, uint64 _dstChainId)
    internal
    returns (uint256 updatedAmount, uint256 updatedFee) {
        IERC20(_bridgeToken).safeTransfer(rubicFeeReciever, _srcAmtOut * feeRubic / 1000000);
        uint256 _srcAmtOutAfterRubic = _srcAmtOut * (1 - feeRubic / 1000000);
        IWETH(nativeWrap).withdraw(dstCryptoFee[_dstChainId]);
        (bool sent, ) = rubicFeeReciever.call{value: dstCryptoFee[_dstChainId], gas: 50000}("");
        require(sent, "failed to send crypto fee");
        uint256 _feeAfterRubic = _fee - dstCryptoFee[_dstChainId];
        return (_srcAmtOutAfterRubic, _feeAfterRubic);
    }

    // This is needed to receive ETH when calling `IWETH.withdraw`
    receive() external payable {}
}
