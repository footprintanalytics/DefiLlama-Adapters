const ApiService = require('../service/api.service')


exports.getTvl = async function (ctx) {
    ctx.body = await ApiService.getInstance().getTvl(ctx.query)
}
