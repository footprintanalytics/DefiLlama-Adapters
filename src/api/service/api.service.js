const { getTvl, mergeBalances, humanizeNumber } = require('../../../tvl.adapter')
const path = require('path')
const _ = require('lodash')

class ApiService {
    static getInstance() {
        if (!this.instance) {
            this.instance = new ApiService()
        }
        return this.instance
    }

    async getTvl({protocol, chain, timestamp, block_number}){
        const passedFile = path.resolve(process.cwd(), `projects/${protocol}`)
        let module = {}
        try {
            module = require(passedFile)
        } catch (e) {
            console.log(e)
            throw new Error(e)
        }
        let chains = Object.keys(module).filter(item => typeof module[item] === 'object' && !Array.isArray(module[item]))
        if(!_.includes(chains, chain)) throw new Error(`project not support ${chain}`)
        console.log(chain)
        const filterChainModule = _.pick(module, chain)
        console.log(filterChainModule)

        const unixTimestamp = Math.round(Date.now() / 1000) - 60;
        // const { chainBlocks } = await getCurrentBlocks([]); // fetch only ethereum block for local test
        const chainBlocks = {}
        const ethBlock = chainBlocks.ethereum;
        const usdTvls = {};
        const tokensBalances = {};
        const usdTokenBalances = {};
        const chainTvlsToAdd = {};


        let tvlPromises = Object.entries(filterChainModule).map(async ([chain, value]) => {
            if (typeof value !== "object" || value === null) {
                return;
            }
            return Promise.all(
                Object.entries(value).map(async ([tvlType, tvlFunction]) => {
                    if (typeof tvlFunction !== "function") {
                        return;
                    }
                    let storedKey = `${chain}-${tvlType}`;
                    let tvlFunctionIsFetch = false;
                    if (tvlType === "tvl") {
                        storedKey = chain;
                    } else if (tvlType === "fetch") {
                        storedKey = chain;
                        tvlFunctionIsFetch = true;
                    }
                    await getTvl(
                        unixTimestamp,
                        ethBlock,
                        chainBlocks,
                        usdTvls,
                        tokensBalances,
                        usdTokenBalances,
                        tvlFunction,
                        tvlFunctionIsFetch,
                        storedKey,
                    );
                    let keyToAddChainBalances = tvlType;
                    if (tvlType === "tvl" || tvlType === "fetch") {
                        keyToAddChainBalances = "tvl";
                    }
                    if (chainTvlsToAdd[keyToAddChainBalances] === undefined) {
                        chainTvlsToAdd[keyToAddChainBalances] = [storedKey];
                    } else {
                        chainTvlsToAdd[keyToAddChainBalances].push(storedKey);
                    }
                })
            );
        });
        if (filterChainModule.tvl || filterChainModule.fetch) {
            let mainTvlIsFetch;
            if (filterChainModule.tvl) {
                mainTvlIsFetch = false;
            } else {
                mainTvlIsFetch = true;
            }
            const mainTvlPromise = getTvl(
                unixTimestamp,
                ethBlock,
                chainBlocks,
                usdTvls,
                tokensBalances,
                usdTokenBalances,
                mainTvlIsFetch ? module.fetch : module.tvl,
                mainTvlIsFetch,
                "tvl",
            );
            tvlPromises.push(mainTvlPromise);
        }
        console.log("tvlPromises",tvlPromises.length)
        await Promise.all(tvlPromises);
        Object.entries(chainTvlsToAdd).map(([tvlType, storedKeys]) => {
            if (usdTvls[tvlType] === undefined) {
                usdTvls[tvlType] = storedKeys.reduce(
                    (total, key) => total + usdTvls[key],
                    0
                );
                mergeBalances(tvlType, storedKeys, tokensBalances);
                mergeBalances(tvlType, storedKeys, usdTokenBalances);
            }
        });
        if (usdTvls.tvl === undefined) {
            throw new Error(
                "Protocol doesn't have total tvl, make sure to export a tvl key either on the main object or in one of the chains"
            );
        }
        console.log("chainTvlsToAdd", chainTvlsToAdd)
        console.log("usdTvls", usdTvls)
        console.log("tokensBalances", tokensBalances)
        console.log("usdTokenBalances", usdTokenBalances)

        return {protocol, usdTvls, usdTokenBalances}
    }
}

module.exports = ApiService
