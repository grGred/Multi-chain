pragma solidity >=0.8.4;

interface ISwapContractV3 {
    /**
     * @param blockchain Number of blockchain
     * @param tokenInAmount Depending on swapExactFor:
     * if _false_ then:
     * The max amount of tokens to sell
     * if _true_ then:
     * The exact amount of tokens to sell
     * @param firstPath Path used for swapping tokens to *RBC (tokenIn address,.., *RBC addres)
     * @param secondPath Path used for swapping *RBC to tokenOut (*RBC address,.., tokenOut address)
     * @param exactRBCtokenOut Depending on swapExactFor:
     * if _false_ then:
     * The exact amount of *RBC to get after first swap
     * if _true_ then:
     * The min amount of *RBC to get after first swap
     * @param tokenOutMin Minimal amount of tokens (or crypto) to get after second swap
     * @param newAddress Address in the blockchain to which the user wants to transfer
     * @param provider The address of a provider for whom to add bonus fees
     * @param swapToCrypto This must be _true_ if swapping tokens to desired blockchain's crypto
     * @param swapExactFor This must be _true_ if willing to use exactInput()
     * @param signature The signature of function that's needed for backend
     */
    struct swapToParams {
        uint256 blockchain;
        uint256 tokenInAmount;
        bytes firstPath;
        bytes32[] secondPath;
        uint256 exactRBCtokenOut;
        uint256 tokenOutMin;
        bytes32 newAddress;
        address provider;
        bool swapToCrypto;
        bool swapExactFor;
        string signature;
    }

    /**
     * @param user User address // "newAddress" from event
     * @param provider The address of a provider for whom to add bonus fees
     * @param initBlockchainNum The number of an initial blockchain
     * @param amountWithFee Amount of tokens with included fees to transfer from the pool // "RBCAmountIn" from event
     * @param amountOutMin Minimal amount of tokens to get after second swap // "tokenOutMin" from event
     * @param path Path used for a second swap // "secondPath" from event
     * @param originalTxHash Hash of transaction from other network, on which swap was called
     * @param concatSignatures Concatenated string of signature bytes for verification of transaction
     */
    struct swapFromParams {
        address user;
        address provider;
        uint256 initBlockchainNum;
        uint256 amountWithFee;
        uint256 amountOutMin;
        bytes path;
        bytes32 originalTxHash;
        bytes concatSignatures;
    }
}
