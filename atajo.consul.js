const RxJs = require('@reactivex/rxjs');

let consul = null;


class Consul {

    constructor(opts) {

        this.consul = require('consul')(config.get('CONSUL').api);
        this.fetch = [];

        let fetchList = config.get('CONSUL').fetch;
        for (var i in fetchList) {
            this.add(i, fetchList[i]);
        }

        return this;
    }


    add(key, token) {
        this.fetch.push({ key: key, token: token });
    }


    start(interval = config.get('CONSUL').checkInterval) {

        let that = this;
        log.debug("Starting Consul Client [ Refresh every " + interval + "ms ]");

        return new RxJs.Observable(observer => {

            that.observer = observer;
            that.interval = setInterval((() => that.process()), interval);
            that.process();


        });



    }

    stop() {
        log.debug("Stopping Consul Client");
        clearInterval(this.interval);
    }


    process() {

        var that = this;

        for (var i in this.fetch) {

            let parameters = this.fetch[i];

            that.consul.kv.get(parameters).then(response => {

                // log.debug("CONSUL:RESPONSE : ", response);

                that.observer.next({ key: response.Key, value: response.Value });

            }).catch(err => {
                log.error(err);
                that.observer.error(err);

            });

        }

    }


    map(domain) {

        var that = this;

        log.debug("GETTING MAP FOR " + domain + " -> ", config.get('CONSUL').map);
        let map = config.get('CONSUL').map;
        that.consul.kv.get(map).then(response => {

            let value = JSON.parse(response.Value);
            for (var i in value) {
                if (i == domain) {
                    log.debug("CONSUL:ADDING DOMAIN : ", i, value[i]);
                    that.add(i, value[i]);
                    break;
                }
            }

            if (that.fetch.length == 0) {
                log.error("DOMAIN " + domain + " NOT FOUND");
                process.exit(1);
            }

            that.process();


        }).catch(err => {
            log.error(err);

        });





    }

}


module.exports = Consul;