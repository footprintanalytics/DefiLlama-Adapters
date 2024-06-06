#!/usr/bin/env node


const handleError = require('./utils/handleError')
const INTERNAL_CACHE_FILE = 'tvl-adapter-repo/sdkInternalCache.json'
process.on('unhandledRejection', handleError)
process.on('uncaughtException', handleError)

const path = require("path");
require("dotenv").config();
const { ENV_KEYS } = require("./projects/helper/env");
const { util: {
  blocks: { getBlockNumber },
  humanizeNumber: { humanizeNumber },
} } = require("@defillama/sdk");
const { util } = require("@defillama/sdk");
const sdk = require("@defillama/sdk");
const whitelistedExportKeys = require('./projects/helper/whitelistedExportKeys.json')
const chainList = require('./projects/helper/chains.json')
const { log, diplayUnknownTable, sliceIntoChunks } = require('./projects/helper/utils')
const { normalizeAddress } = require('./projects/helper/tokenMapping')
const { PromisePool } = require('@supercharge/promise-pool')

const currentCacheVersion = sdk.cache.currentVersion // load env for cache
// console.log(`Using cache version ${currentCacheVersion}`)

if (process.env.LLAMA_SANITIZE)
  Object.keys(process.env).forEach((key) => {
    if (key.endsWith('_RPC')) return;
    if (['TVL_LOCAL_CACHE_ROOT_FOLDER', 'LLAMA_DEBUG_MODE', ...ENV_KEYS].includes(key) || key.includes('SDK')) return;
    delete process.env[key]
  })
process.env.SKIP_RPC_CHECK = 'true'


async function getTvl(
  unixTimestamp,
  ethBlock,
  chainBlocks,
  usdTvls,
  tokensBalances,
  usdTokenBalances,
  tvlFunction,
  isFetchFunction,
  storedKey,
  ) {
  const chain = storedKey.split('-')[0]
  const api = new sdk.ChainApi({ chain, block: chainBlocks[chain], timestamp: unixTimestamp, storedKey, })
  api.api = api
  api.storedKey = storedKey
  if (!isFetchFunction) {
    let tvlBalances = await tvlFunction(api, ethBlock, chainBlocks, api);
    console.log("tvlBalances", tvlBalances)
    if (tvlBalances === undefined) tvlBalances = api.getBalances()
    console.log("tvlBalances", tvlBalances)
    const tvlResults = await computeTVL(tvlBalances, unixTimestamp);

    await diplayUnknownTable({ tvlResults, storedKey, tvlBalances, })
    usdTvls[storedKey] = tvlResults.usdTvl;
    tokensBalances[storedKey] = tvlResults.tokenBalances;
    usdTokenBalances[storedKey] = tvlResults.usdTokenBalances;
  } else {
    usdTvls[storedKey] = Number(
      await tvlFunction(api, ethBlock, chainBlocks, api)
    );
  }
  if (
    typeof usdTvls[storedKey] !== "number" ||
    Number.isNaN(usdTvls[storedKey])
  ) {
    throw new Error(
      `TVL for key ${storedKey} is not a number, instead it is ${usdTvls[storedKey]}`
    );
  }
}

function mergeBalances(key, storedKeys, balancesObject) {
  if (balancesObject[key] === undefined) {
    balancesObject[key] = {};
    storedKeys.map((keyToMerge) => {
      Object.entries(balancesObject[keyToMerge]).forEach((balance) => {
        try {
          util.sumSingleBalance(balancesObject[key], balance[0], BigNumber(balance[1] || '0').toFixed(0));
        } catch (e) {
          console.log(e)
        }
      });
    });
  }
}

// if (process.argv.length < 3) {
//   console.error(`Missing argument, you need to provide the filename of the adapter to test.
//     Eg: node test.js projects/myadapter.js`);
//   process.exit(1);
// }
// const passedFile = path.resolve(process.cwd(), .argv[2]);

const originalCall = sdk.api.abi.call
sdk.api.abi.call = async (...args) => {
  try {
    return await originalCall(...args)
  } catch (e) {
    console.log("sdk.api.abi.call errored with params:", args)
    throw e
  }
}


const BigNumber = require("bignumber.js");
const axios = require("axios");

const ethereumAddress = "0x0000000000000000000000000000000000000000";
const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
function fixBalances(balances) {

  Object.entries(balances).forEach(([token, value]) => {
    let newKey
    if (token.startsWith("0x")) newKey = `ethereum:${token}`
    else if (!token.includes(':')) newKey = `coingecko:${token}`
    if (newKey) {
      delete balances[token]
      sdk.util.sumSingleBalance(balances, newKey, BigNumber(value).toFixed(0))
    }
  })
}

const confidenceThreshold = 0.5
async function computeTVL(balances, timestamp) {
  fixBalances(balances)

  Object.keys(balances).map(k => {
    const balance = balances[k]
    delete balances[k]
    if (+balance === 0)
      return;
    const normalizedAddress = normalizeAddress(k, undefined, true)
    sdk.util.sumSingleBalance(balances, normalizedAddress, balance)
  })

  const eth = balances[ethereumAddress];
  if (eth !== undefined) {
    balances[weth] = new BigNumber(balances[weth] ?? 0).plus(eth).toFixed(0);
    delete balances[ethereumAddress];
  }

  const PKsToTokens = {};
  const readKeys = Object.keys(balances)
    .map((address) => {
      const PK = address;
      if (PKsToTokens[PK] === undefined) {
        PKsToTokens[PK] = [address];
        return PK;
      } else {
        PKsToTokens[PK].push(address);
        return undefined;
      }
    })
    .filter((item) => item !== undefined);

  const unknownTokens = {}
  let tokenData = []
  readKeys.forEach(i => unknownTokens[i] = true)

  const { errors } = await PromisePool.withConcurrency(5)
    .for(sliceIntoChunks(readKeys, 100))
    .process(async (keys) => {
      tokenData.push((await axios.get(`https://coins.llama.fi/prices/historical/${timestamp}/${keys.join(',')}`)).data.coins)
    })

  if (errors && errors.length)
    throw errors[0]

  let usdTvl = 0;
  const tokenBalances = {};
  const usdTokenBalances = {};

  tokenData.forEach(response => {
    Object.keys(response).forEach(address => {
      delete unknownTokens[address]
      const data = response[address];
      const balance = balances[address];

      if (data == undefined) tokenBalances[`UNKNOWN (${address})`] = balance
      if ('confidence' in data && data.confidence < confidenceThreshold || !data.price) return
      // if (Math.abs(data.timestamp - Date.now() / 1e3) > (24 * 3600)) {
      //   console.log(`Price for ${address} is stale, ignoring...`)
      //   return
      // }

      let amount, usdAmount;
      if (address.includes(":") && !address.startsWith("coingecko:")) {
        amount = new BigNumber(balance).div(10 ** data.decimals).toNumber();
        usdAmount = amount * data.price;
      } else {
        amount = Number(balance);
        usdAmount = amount * data.price;
      }

      if (usdAmount > 1e8) {
        console.log(`-------------------
Warning: `)
        console.log(`Token ${address} has more than 100M in value (${usdAmount / 1e6} M) , price data: `, data)
        console.log(`-------------------`)
      }
      tokenBalances[data.symbol] = (tokenBalances[data.symbol] ?? 0) + amount;
      usdTokenBalances[data.symbol] = (usdTokenBalances[data.symbol] ?? 0) + usdAmount;
      usdTvl += usdAmount;
      if (isNaN(usdTvl)) {
        throw new Error(`NaN usdTvl for ${address} with balance ${balance} and price ${data.price}`)
      }
    })
  });

  Object.keys(unknownTokens).forEach(address => tokenBalances[`UNKNOWN (${address})`] = balances[address])


  // console.log('--------token balances-------')
  // console.table(tokenBalances)

  return {
    usdTvl,
    tokenBalances,
    usdTokenBalances,
  };
}

// setTimeout(() => {
//   console.log("Timeout reached, exiting...");
//   if (!process.env.NO_EXIT_ON_LONG_RUN_RPC)
//     process.exit(1);
// }, 10 * 60 * 1000) // 10 minutes



async function initCache() {
  let currentCache = await sdk.cache.readCache(INTERNAL_CACHE_FILE)
  // if (process.env.NO_EXIT_ON_LONG_RUN_RPC)
  //   sdk.log('cache size:', JSON.stringify(currentCache).length, 'chains:', Object.keys(currentCache).length)
  const ONE_WEEK = 60 * 60 * 24 * 31
  if (!currentCache || !currentCache.startTime || (Date.now() / 1000 - currentCache.startTime > ONE_WEEK)) {
    currentCache = {
      startTime: Math.round(Date.now() / 1000),
    }
    await sdk.cache.writeCache(INTERNAL_CACHE_FILE, currentCache)
  }
  sdk.sdkCache.startCache(currentCache)
}

async function saveSdkInternalCache() {
  await sdk.cache.writeCache(INTERNAL_CACHE_FILE, sdk.sdkCache.retriveCache(), { skipR2CacheWrite: true })
}

async function preExit() {
  // try {
  //     await saveSdkInternalCache() // save sdk cache to r2
  // } catch (e) {
  //   if (process.env.NO_EXIT_ON_LONG_RUN_RPC)
  //     sdk.error(e)
  // }
}

module.exports = {
  getTvl,
  mergeBalances,
  humanizeNumber
}
