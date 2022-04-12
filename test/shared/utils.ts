import { IUniswapV2Router02 } from '../../typechain-types';
import UniV2JSON from '@uniswap/v2-periphery/build/UniswapV2Router02.json';
import UniV3JSON from '@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json';
import { ethers } from 'hardhat';
import { Wallet } from '@ethersproject/wallet';
import { DEADLINE } from './consts';

export const getRouterV2 = async function (
    wallet: Wallet,
    routerAddress: string
): Promise<IUniswapV2Router02> {
    const routerFactory = ethers.ContractFactory.fromSolidity(UniV2JSON);
    let router = routerFactory.attach(routerAddress) as IUniswapV2Router02;
    router = router.connect(wallet);

    return router;
};

export const createPoolV2 = async function (
    wallet: Wallet,
    routerAddress: string,
    token: string,
    tokenAmount = ethers.utils.parseEther('100')
): Promise<IUniswapV2Router02> {
    const router = await getRouterV2(wallet, routerAddress);

    await router.addLiquidityETH(
        token,
        tokenAmount,
        tokenAmount,
        ethers.utils.parseEther('100'),
        await router.signer.getAddress(),
        DEADLINE,
        { value: ethers.utils.parseEther('100') }
    );

    return router;
};
