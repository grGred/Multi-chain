import { ethers, network, waffle } from 'hardhat';
import { swapContractFixtureInFork } from './shared/fixtures';
import { Wallet } from '@ethersproject/wallet';
import { RubicRouterV2, TestERC20, TestMessages, WETH9 } from '../typechain-types';
import { expect } from 'chai';
import {
    DEADLINE,
    DST_CHAIN_ID,
    VERSION,
    ZERO_ADDRESS,
    DEFAULT_AMOUNT_OUT_MIN,
    EXECUTOR_ADDRESS,
    INTEGRATOR,
    DEFAULT_AMOUNT_IN_USDC,
    DEFAULT_AMOUNT_IN
} from './shared/consts';
import { BigNumber as BN, BigNumberish, ContractTransaction } from 'ethers';
const hre = require('hardhat');

const createFixtureLoader = waffle.createFixtureLoader;

const envConfig = require('dotenv').config();
const {
    ROUTERS_POLYGON: TEST_ROUTERS,
    NATIVE_POLYGON: TEST_NATIVE,
    BUS_POLYGON_MAIN: TEST_BUS
} = envConfig.parsed || {};

describe('RubicSettings', () => {
    let wallet: Wallet, other: Wallet;
    let swapToken: TestERC20;
    let transitToken: TestERC20;
    let swapMain: RubicRouterV2;
    let router: string;
    let routerV3: string;
    let wnative: WETH9;
    let chainId: number;

    let testMessagesContract: TestMessages;

    let loadFixture: ReturnType<typeof createFixtureLoader>;

    before('create fixture loader', async () => {
        [wallet, other] = await (ethers as any).getSigners();
        loadFixture = createFixtureLoader([wallet, other]);
        chainId = (await ethers.provider.getNetwork()).chainId;

        await hre.network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [TEST_BUS]
        });
    });

    beforeEach('deploy fixture', async () => {
        ({ swapMain, swapToken, transitToken, wnative, router, routerV3, testMessagesContract } =
            await loadFixture(swapContractFixtureInFork));
    });

    it('constructor initializes', async () => {
        expect(await swapMain.nativeWrap()).to.eq(TEST_NATIVE);
        expect(await swapMain.messageBus()).to.eq(TEST_BUS);

        const routers = TEST_ROUTERS.split(',');
        expect(await swapMain.getSupportedDEXes()).to.deep.eq(routers);
    });

    describe.only('#Contract utility tests', () => {
        describe('#sweepTokens', () => {
            beforeEach('Setup for target executions', async () => {
                // transfer 1000 USDC
                await transitToken.transfer(swapMain.address, ethers.BigNumber.from('1000000000'));

                // create bus and send 1 weth to router
                const bus = await ethers.getSigner(TEST_BUS);

                await network.provider.send('hardhat_setBalance', [
                    bus.address,
                    '0x152D02C7E14AF6800000' // 100000 eth
                ]);
                const abiCoder = ethers.utils.defaultAbiCoder;

                const storageBalancePositionWeth = ethers.utils.keccak256(
                    abiCoder.encode(['address'], [bus.address]) +
                        abiCoder.encode(['uint256'], [3]).slice(2, 66)
                );

                await network.provider.send('hardhat_setStorageAt', [
                    wnative.address,
                    storageBalancePositionWeth,
                    abiCoder.encode(['uint256'], [ethers.utils.parseEther('100000')])
                ]);

                await wnative.connect(bus).transfer(swapMain.address, ethers.utils.parseEther('1'));

                await wnative.connect(bus).transfer(swapMain.address, ethers.utils.parseEther('1'));
            });

            it('Should successfully sweep tokens', async () => {
                const balanceBefore = await transitToken.balanceOf(wallet.address);

                await swapMain.sweepTokens(transitToken.address, DEFAULT_AMOUNT_IN_USDC);

                const balanceAfter = await transitToken.balanceOf(wallet.address);
                await expect(balanceBefore.add(DEFAULT_AMOUNT_IN_USDC)).to.be.eq(balanceAfter);
            });

            it('Should successfully sweep native', async () => {
                const balanceBefore = await wnative.balanceOf(swapMain.address);

                await swapMain.sweepTokens(wnative.address, DEFAULT_AMOUNT_IN);

                const balanceAfter = await wnative.balanceOf(swapMain.address);
                await expect(balanceBefore.sub(DEFAULT_AMOUNT_IN)).to.be.eq(balanceAfter);
            });

            it('Should successfully fail sweepTokens', async () => {
                await expect(
                    swapMain
                        .connect(other)
                        .sweepTokens(transitToken.address, DEFAULT_AMOUNT_IN_USDC)
                ).to.be.revertedWith('Caller is not a manager');
            });

            it('Should successfully fail sweepTokens', async () => {
                await expect(
                    swapMain.connect(other).sweepTokens(wnative.address, DEFAULT_AMOUNT_IN)
                ).to.be.revertedWith('Caller is not a manager');
            });
        });
    });
});
