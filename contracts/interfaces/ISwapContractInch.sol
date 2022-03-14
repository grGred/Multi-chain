pragma solidity >=0.8.4;

interface ISwapContractInch{
    /**
     * @param blockchain Number of target blockchain
     * @param srcAmount The amount of token that is going to be sold
     * @param srcToken The address of token that is going to be sold
     * @param secondPath Path used for swapping *RBC to tokenOut (*RBC address,.., tokenOut address)
     * @param minTransitOut The minimal amount of transit token required after initial swap
     * @param tokenOutMin Minimal amount of tokens (or crypto) to get after second swap
     * @param newAddress Address in the blockchain to which the user wants to transfer
     * @param provider The address of a provider for whom to add bonus fees
     * @param swapToCrypto This must be _true_ if swapping tokens to desired blockchain's crypto
     * @param data The data that is passed to 1inch Router
     * @param signature This parameter tells backend what function to call in the target network
     */
    struct swapToParams {
        uint256 blockchain;
        uint256 srcAmount;
        address srcToken;
        bytes32[] secondPath;
        uint256 minTransitOut;
        uint256 tokenOutMin;
        bytes32 newAddress;
        address provider;
        bool swapToCrypto;
        bytes data;
        string signature;
    }

    /**
     * @param user User address // "newAddress" from event
     * @param provider The address of a provider for whom to add bonus fees
     * @param dstToken The token that's requested to buy
     * @param initBlockchainNum The number of an initial blockchain
     * @param amountWithFee Amount of tokens with included fees to transfer from the pool // "RBCAmountIn" from event
     * @param amountOutMin Minimal amount of tokens to get after second swap // "tokenOutMin" from event
     * @param originalTxHash Hash of transaction from other network, on which swap was called
     * @param concatSignatures Concatenated string of signature bytes for verification of transaction
     * @param data The data got from 1Inch API
     */
    struct swapFromParams {
        address user;
        address provider;
        address dstToken;
        uint256 initBlockchainNum;
        uint256 amountWithFee;
        uint256 amountOutMin;
        bytes32 originalTxHash;
        bytes concatSignatures;
        bytes data;
    }
}