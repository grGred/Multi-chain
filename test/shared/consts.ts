import { ethers } from 'hardhat';

export const DEADLINE = '9999999999999999';
export const DST_CHAIN_ID = 5;
export const VERSION_V2 = 0;
export const VERSION_V3 = 1;
export const VERSION = 2;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const INTEGRATOR = '0x23a05b3673DFBf0d1Ce9Bfa6407eD0DbD068aF2D'; // random address
export const feeDecimals = 10 ** 6;
export const EXECUTOR_ADDRESS = '0x645144372C15d5AA59E343353610Cc7C5A926289';
export const DEFAULT_AMOUNT_IN = ethers.utils.parseEther('1');
export const DEFAULT_AMOUNT_OUT_MIN = ethers.utils.parseEther('1');
export const DEFAULT_AMOUNT_IN_USDC = '100000000';
