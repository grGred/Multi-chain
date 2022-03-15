pragma solidity >=0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../framework/MessageBusAddress.sol";
import "../framework/MessageSenderApp.sol";
import "../framework/MessageReceiverApp.sol";


contract SwapBase is MessageSenderApp, MessageReceiverApp {

    mapping(address => bool) supportedDex;
    mapping(uint64 => uint256) public dstCryptoFee;

    // erc20 wrap of gas token of this chain, eg. WETH
    address public nativeWrap;

    uint256 public minSwapAmount;
    uint256 public feeRubic; // 1m is 100%
    uint8 public decimals = 18;

    constructor(
        address _messageBus,
        address _supportedDex,
        address _nativeWrap
    ) {
        messageBus = _messageBus;
        supportedDex[_supportedDex] = true;
        nativeWrap = _nativeWrap;
        dstCryptoFee[43114] = 10000000;
        minSwapAmount = 8 * 10**decimals; // * decimals which are changeable
        feeRubic = 160000; // 0.16%
    }

    modifier onlyEOA() {
        require(msg.sender == tx.origin, "Not EOA");
        _;
    }

    // ============== structs for V2 like dexes ==============

    struct SwapInfoV2 {
        // if this array has only one element, it means no need to swap
        address[] path;
        // the following fields are only needed if path.length > 1
        address dex; // the DEX to use for the swap
        uint256 deadline; // deadline for the swap
        uint256 minRecvAmt; // minimum receive amount for the swap
    }

    struct SwapRequestV2 {
        SwapInfoV2 swap;
        // the receiving party (the user) of the final output token
        address receiver;
        // this field is best to be per-user per-transaction unique so that
        // a nonce that is specified by the calling party (the user),
        uint64 nonce;
        // indicates whether the output token coming out of the swap on destination
        // chain should be unwrapped before sending to the user
        bool nativeOut;
        SwapVersion version;
    }

    // ============== structs for V3 like dexes ==============

    struct SwapInfoV3 {
        address dex; // the DEX to use for the swap
        // the receiving party (the user) of the final output token
        bytes path;
        // address receiver;
        uint256 deadline;
        // uint256 amountIn;
        uint256 amountOutMinimum;
    }

    struct SwapRequestV3 {
        SwapInfoV3 swap;
        // this field is best to be per-user per-transaction unique so that
        // a nonce that is specified by the calling party (the user),
        address receiver;
        uint64 nonce;
        // indicates whether the output token coming out of the swap on destination
        // chain should be unwrapped before sending to the user
        bool nativeOut;
        SwapVersion version;
    }

    enum SwapVersion {
        inch,
        v2,
        v3
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

    // This is needed to receive ETH when calling `IWETH.withdraw`
    receive() external payable {}

}
