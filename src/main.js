
/************** koa **************/
const http = require('http')
const Koa = require('koa')
const koaBodyParser = require('koa-bodyparser')
const koaJson = require('koa-json')
const koaMorgan = require('koa-morgan')
const Router = require('./router')
const cors = require('@koa/cors')

const router = new Router()
const koaApp = new Koa()

// middleware
koaApp.use(
    koaBodyParser({
      jsonLimit: '10mb',
      extendTypes: {
        text: ['application/xml', 'text/xml', 'text/plain']
      },
      enableTypes: ['text', 'json', 'form']
    })
  )
koaApp.use(koaJson())
koaApp.use(
  koaMorgan('tiny', {
    skip: function (req, res) {
      return /\/docs\//.exec(req.url) || /\/healthcheck\//.exec(req.url)
    }
  })
)

// statics
koaApp.use(cors({ credentials: true }))
koaApp.use(router.routes())

const server = http.createServer(koaApp.callback()).listen(3001,  () => {
  console.log(`🚀 Server ready at http://localhost:${3001}`)
})