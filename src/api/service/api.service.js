const { getTvl } = require('../../../test')

class ApiService {
    static getInstance() {
        if (!this.instance) {
            this.instance = new ApiService()
        }
        return this.instance
    }

    async getTvl(params){
        const res = getTvl()
        return params
    }
}

module.exports = ApiService
