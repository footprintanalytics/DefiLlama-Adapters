const {
  getTvl
} = require('./controller/api.controller')

module.exports = function (router) {
  router.get('/tvl', getTvl)
}
