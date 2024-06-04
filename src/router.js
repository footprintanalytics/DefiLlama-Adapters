const KoaRouter = require('koa-router')
const ResponseFormatter = require('./midderware/response.formatter')

class Router extends KoaRouter {

  constructor () {
    super({ prefix: '/api/v1' })
    this.use('/', ResponseFormatter.format())
    this.setupRoutes()
  }

  setupRoutes = () => {
    // data api
    require('./api/router')(this)
  }
}

module.exports = Router