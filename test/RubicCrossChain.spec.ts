import { ethers, waffle } from 'hardhat';
import { swapContractFixtureInFork } from './shared/fixtures';
import { Wallet } from '@ethersproject/wallet';
import { SwapMain, TestERC20, TestMessages, WETH9 } from '../typechain-types';
import { expect } from 'chai';
import {
    DEADLINE,
    DST_CHAIN_ID,
    DEFAULT_AMOUNT_IN,
    VERSION,
    MAX_RUBIC_SWAP,
    DEFAULT_AMOUNT_OUT_MIN
} from './shared/consts';
import { BigNumber as BN, BigNumberish, ContractTransaction } from 'ethers';
import { getRouterV2 } from './shared/utils';
const hre = require('hardhat');

const createFixtureLoader = waffle.createFixtureLoader;

const envConfig = require('dotenv').config();
const {
    ROUTERS_BSC_TESTNET: TEST_ROUTERS,
    NATIVE_BSC_TESTNET: TEST_NATIVE,
    BUS_BSC_TESTNET: TEST_BUS,
    TRANSIT_BSC_TESTNET: TEST_TRANSIT,
    SWAP_TOKEN_BSC_TESTNET: TEST_SWAP_TOKEN
} = envConfig.parsed || {};

describe('RubicCrossChain', () => {
    let wallet: Wallet, other: Wallet;
    let swapToken: TestERC20;
    let token: TestERC20;
    let swapMain: SwapMain;
    let router: string;
    let wnative: WETH9;
    let chainId: number;

    let testMessagesContract: TestMessages;

    let loadFixture: ReturnType<typeof createFixtureLoader>;

    async function callTransferWithSwapV2Native(
        amountOutMinimum: BigNumberish,
        {
            receiver = null,
            amountIn = DEFAULT_AMOUNT_IN,
            dstChainID = DST_CHAIN_ID,
            srcDEX = router,
            srcPath = [wnative.address, token.address],
            nativeOut = false,
            nativeIn = null,
            disableRubic = false
        } = {}
    ): Promise<ContractTransaction> {
        const cryptoFee = await swapMain.dstCryptoFee(dstChainID);

        return swapMain.transferWithSwapV2Native(
            receiver === null ? wallet.address : receiver,
            amountIn,
            dstChainID,
            {
                dex: srcDEX,
                path: srcPath,
                deadline: DEADLINE,
                amountOutMinimum
            },
            {
                dex: router,
                version: VERSION,
                path: [wnative.address, token.address],
                dataInchOrPathV3: '0x',
                deadline: DEADLINE,
                amountOutMinimum: DEFAULT_AMOUNT_OUT_MIN
            },
            '10',
            nativeOut,
            disableRubic,
            {
                value:
                    nativeIn === null
                        ? amountIn.add(cryptoFee).add(ethers.utils.parseEther('2')) //TODO: add crypto celer fee
                        : nativeIn
            }
        );
    }

    async function callTransferWithSwapV2(
        amountOutMinimum: BigNumberish,
        {
            receiver = null,
            amountIn = DEFAULT_AMOUNT_IN,
            dstChainID = DST_CHAIN_ID,
            srcDEX = router,
            srcPath = [wnative.address, token.address],
            nativeOut = false,
            nativeIn = null,
            disableRubic = false
        } = {}
    ): Promise<ContractTransaction> {
        const cryptoFee = await swapMain.dstCryptoFee(dstChainID);

        return swapMain.transferWithSwapV2(
            receiver === null ? wallet.address : receiver,
            amountIn,
            dstChainID,
            {
                dex: srcDEX,
                path: srcPath,
                deadline: DEADLINE,
                amountOutMinimum
            },
            {
                dex: router,
                version: VERSION,
                path: [wnative.address, token.address],
                dataInchOrPathV3: '0x',
                deadline: DEADLINE,
                amountOutMinimum: DEFAULT_AMOUNT_OUT_MIN
            },
            '10',
            nativeOut,
            disableRubic,
            { value: nativeIn === null ? cryptoFee.add(ethers.utils.parseEther('0.01')) : nativeIn }
        );
    }

    async function getAmountOutMin(
        amountIn = DEFAULT_AMOUNT_IN,
        path = [wnative.address, token.address]
    ) {
        const routerV2 = await getRouterV2(wallet, router);

        return (await routerV2.getAmountsOut(amountIn, path))[1];
    }

    async function getAmountIn(
        amountOut = DEFAULT_AMOUNT_OUT_MIN,
        path = [token.address, swapToken.address]
    ) {
        const routerV2 = await getRouterV2(wallet, router);

        return (await routerV2.getAmountsIn(amountOut, path))[0];
    }

    async function getMessage(
        messagesContract: TestMessages,
        _nonce: BigNumberish,
        {
            dex = router,
            version = VERSION,
            path = [wnative.address, token.address],
            dataInchOrPathV3 = '0x',
            deadline = DEADLINE,
            amountOutMinimum = DEFAULT_AMOUNT_OUT_MIN,
            _receiver = wallet.address,
            _nativeOut = false
        } = {}
    ): Promise<string> {
        return messagesContract.getMessage(
            {
                dex,
                version,
                path,
                dataInchOrPathV3,
                deadline,
                amountOutMinimum
            },
            _receiver,
            _nonce,
            _nativeOut
        );
    }

    async function getID(
        messagesContract: TestMessages,
        _nonce: BigNumberish,
        {
            dex = router,
            version = VERSION,
            path = [wnative.address, token.address],
            dataInchOrPathV3 = '0x',
            deadline = DEADLINE,
            amountOutMinimum = DEFAULT_AMOUNT_OUT_MIN,
            _receiver = wallet.address,
            _nativeOut = false,
            _srcChainId = chainId,
            _dstChainId = DST_CHAIN_ID
        } = {}
    ): Promise<string> {
        return messagesContract.getID(
            _receiver,
            _srcChainId,
            _dstChainId,
            {
                dex,
                version,
                path,
                dataInchOrPathV3,
                deadline,
                amountOutMinimum
            },
            _nonce,
            _nativeOut
        );
    }

    before('create fixture loader', async () => {
        [wallet, other] = await (ethers as any).getSigners();
        loadFixture = createFixtureLoader([wallet, other]);
        chainId = (await ethers.provider.getNetwork()).chainId;
    });

    beforeEach('deploy fixture', async () => {
        ({ swapMain, swapToken, token, wnative, router, testMessagesContract } = await loadFixture(
            swapContractFixtureInFork
        ));
    });

    it('constructor initializes', async () => {
        expect(await swapMain.nativeWrap()).to.eq(TEST_NATIVE);
        expect(await swapMain.rubicTransit()).to.eq(token.address);
        expect(await swapMain.messageBus()).to.eq(TEST_BUS);

        const routers = TEST_ROUTERS.split(',');
        expect(await swapMain.getSupportedDEXes()).to.deep.eq(routers);
    });

    describe('#WithSwapTests', () => {
        describe('#transferWithSwapV2Native', () => {
            it('Should swap native and transfer through Rubic only', async () => {
                const amountOutMin = await getAmountOutMin(ethers.utils.parseEther('0.1'));

                const message = await getMessage(
                    testMessagesContract,
                    (await swapMain.nonce()).add('1')
                );

                await expect(
                    callTransferWithSwapV2Native(amountOutMin, {
                        amountIn: ethers.utils.parseEther('0.1')
                    })
                )
                    .to.emit(swapMain, 'RubciSwapRequest')
                    .withArgs(amountOutMin, message, false);

                expect(await token.balanceOf(swapMain.address)).to.be.eq(amountOutMin);
            });
            it('Should swap native and transfer through Celer only', async () => {
                const ID = await getID(testMessagesContract, (await swapMain.nonce()).add('1'));

                const amountOutMin = await getAmountOutMin();

                await expect(
                    callTransferWithSwapV2Native(amountOutMin, {
                        disableRubic: true,
                        srcPath: [wnative.address, token.address]
                    })
                )
                    .to.emit(swapMain, 'SwapRequestSentV2')
                    .withArgs(ID, DST_CHAIN_ID, DEFAULT_AMOUNT_IN, wnative.address);
            });
            describe('Should swap native and perform split swap', () => {
                let amountOutMin: BN;
                let rubicPart: BN;

                beforeEach('Get amounts', async () => {
                    amountOutMin = await getAmountOutMin();
                    rubicPart = await swapMain.maxRubicSwap();
                });
                it('Correct Celer event', async () => {
                    const ID = await getID(testMessagesContract, (await swapMain.nonce()).add('1'));
                    await expect(callTransferWithSwapV2Native(amountOutMin))
                        .to.emit(swapMain, 'SwapRequestSentV2')
                        .withArgs(ID, DST_CHAIN_ID, DEFAULT_AMOUNT_IN, wnative.address);
                });
                it('Correct Rubic event', async () => {
                    const message = await getMessage(
                        testMessagesContract,
                        (await swapMain.nonce()).add('1')
                    );
                    await expect(callTransferWithSwapV2Native(amountOutMin))
                        .to.emit(swapMain, 'RubciSwapRequest')
                        .withArgs(rubicPart, message, false);
                    expect(await token.balanceOf(swapMain.address)).to.be.eq(rubicPart);
                });
            });
        });
        describe('#transferWithSwapV2', () => {
            it('Should swap token and transfer through Rubic only', async () => {
                await swapToken.approve(swapMain.address, ethers.constants.MaxUint256);
                const amountOutMin = await getAmountOutMin(DEFAULT_AMOUNT_IN, [
                    swapToken.address,
                    token.address
                ]);

                const message = await getMessage(
                    testMessagesContract,
                    (await swapMain.nonce()).add('1')
                );

                await expect(
                    callTransferWithSwapV2(amountOutMin, {
                        srcPath: [swapToken.address, token.address]
                    })
                )
                    .to.emit(swapMain, 'RubciSwapRequest')
                    .withArgs(amountOutMin, message, false);

                expect(await token.balanceOf(swapMain.address)).to.be.eq(amountOutMin);
            });
            it('Should swap token and transfer through Сeler only', async () => {
                await swapToken.approve(swapMain.address, ethers.constants.MaxUint256);

                const amountOutMin = await getAmountOutMin(DEFAULT_AMOUNT_IN, [
                    swapToken.address,
                    token.address
                ]);

                const ID = await getID(testMessagesContract, (await swapMain.nonce()).add('1'));
                await expect(
                    callTransferWithSwapV2(amountOutMin, {
                        srcPath: [swapToken.address, token.address],
                        disableRubic: true
                    })
                )
                    .to.emit(swapMain, 'SwapRequestSentV2')
                    .withArgs(ID, DST_CHAIN_ID, DEFAULT_AMOUNT_IN, swapToken.address);
            });
            describe('Should swap native and perform split swap', () => {
                let amountOutMin: BN;
                let rubicPart: BN;
                const amountIn = ethers.utils.parseEther('3000');

                beforeEach('Get amounts', async () => {
                    await swapToken.approve(swapMain.address, ethers.constants.MaxUint256);
                    amountOutMin = await getAmountOutMin(amountIn, [
                        swapToken.address,
                        token.address
                    ]);
                    rubicPart = await swapMain.maxRubicSwap();
                });
                it('Correct Celer event', async () => {
                    const ID = await getID(testMessagesContract, (await swapMain.nonce()).add('1'));
                    await expect(
                        callTransferWithSwapV2(amountOutMin, {
                            amountIn: amountIn,
                            srcPath: [swapToken.address, token.address]
                        })
                    )
                        .to.emit(swapMain, 'SwapRequestSentV2')
                        .withArgs(ID, DST_CHAIN_ID, amountIn, swapToken.address);
                });
                it('Correct Rubic event', async () => {
                    const message = await getMessage(
                        testMessagesContract,
                        (await swapMain.nonce()).add('1')
                    );
                    await expect(
                        callTransferWithSwapV2(amountOutMin, {
                            amountIn: amountIn,
                            srcPath: [swapToken.address, token.address]
                        })
                    )
                        .to.emit(swapMain, 'RubciSwapRequest')
                        .withArgs(rubicPart, message, false);
                    expect(await token.balanceOf(swapMain.address)).to.be.eq(rubicPart);
                });
            });
        });
        describe('#executeMessageWithTransfer', () => {
            beforeEach('setup for target executions', async () => {
                await token.transfer(swapMain.address, MAX_RUBIC_SWAP);
                await swapMain.setRubicRelayer(wallet.address);
            });
            describe.only('target swap should emit correct event', async () => {
                let nonce: BN;
                let message: string;
                let ID: string;
                let amountIn: BN;
                let amountOut: BN;

                beforeEach('setup before swap', async () => {
                    nonce = (await swapMain.nonce()).add('1');

                    message = await getMessage(testMessagesContract, nonce, {
                        path: [token.address, swapToken.address]
                    });
                    ID = await getID(testMessagesContract, nonce, {
                        _srcChainId: DST_CHAIN_ID,
                        _dstChainId: chainId,
                        path: [token.address, swapToken.address]
                    });

                    amountIn = await getAmountIn();
                    amountOut = await getAmountOutMin(amountIn, [
                        token.address,
                        swapToken.address
                    ]);
                });
                it('Rubic swap', async () => {
                    await expect(
                        swapMain.executeMessageWithTransfer(
                            ethers.constants.AddressZero,
                            token.address,
                            amountIn,
                            DST_CHAIN_ID,
                            message,
                            ethers.constants.AddressZero
                        )
                    )
                        .to.emit(swapMain, 'RubicSwapDone')
                        .withArgs(ID, amountOut, 1);
                });
                it('Celer swap', async () => {
                    await hre.network.provider.request({
                        method: 'hardhat_impersonateAccount',
                        params: [TEST_BUS]
                    });
                    const bus = await ethers.getSigner(TEST_BUS);

                    const _swapMain = swapMain.connect(bus);

                    await expect(
                        _swapMain.executeMessageWithTransfer(
                            ethers.constants.AddressZero,
                            token.address,
                            amountIn,
                            DST_CHAIN_ID,
                            message,
                            ethers.constants.AddressZero
                        )
                    )
                        .to.emit(swapMain, 'CelerSwapDone')
                        .withArgs(ID, amountOut, 1);
                });
            });
        });
        //describe('#')
    });
});
