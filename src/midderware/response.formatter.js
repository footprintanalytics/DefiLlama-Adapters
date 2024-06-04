const _ = require('lodash')

const format = (pattern, notPattern = '@@@') => {
  return async (ctx, next) => {
    const reg = new RegExp(pattern)
    const notReg = new RegExp(notPattern)
    if (!reg.test(ctx.originalUrl) || notReg.test(ctx.originalUrl)) {
      await next()
      return
    }

    try {
      await next()

      ctx.status = 200
      ctx.body = {
        message: 'success',
        code: 0,
        data: ctx.body
      }

    } catch (error) {
      ctx.status = 500
      ctx.errorStack = error.stack
      ctx.body = {
        code: 500,
        message: 'server fail'
      }
    }
  }
}

module.exports = {
  format
}
