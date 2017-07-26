const io = require('socket.io-client');
const Log = require('./atajo.log');
const Consul = require('./atajo.consul');
const Events = require('./atajo.events');
const path = require('path');
const os = require('os');



global.config = require('./config');
global.log = null;
global.release = null;

class IO {



    constructor(release, domain, secret) {

        var that = this;

        global.release = release;
        global.domain = domain;
        global.log = new Log(release, config.get("LOGPATH") || path.join(__dirname, 'logs'));

        that.consul = new Consul()
        this.consul.start().subscribe(
            response => {

                that.identity = JSON.parse(response.value);
                //log.debug("IO:IDENTITY UPDATE : ", that.identity);

                if (!this.started) {
                    this.started = true;
                    this.connect(domain, secret);
                }


            },
            error => {

                log.error("CONSUL UPDATE ERROR : ", error);

            },
            () => {}
        );

        this.consul.map(domain);


    }

    connect(domain, secret) {

        var that = this;

        let core = that.identity.core[release];
        log.debug("CORE  IS ", core);
        let endpoint = core.protocol + "://" + core.host + ":" + core.port;


        let opts = config.get('SOCKET').OPTIONS;
        opts.query = {
            hostname: os.hostname(),
            secret: secret,
            domain: domain,
        }


        log.debug("CONNECTING TO ", endpoint, opts);

        that.socket = io.connect(endpoint, opts);

        that.events = new Events();
        that.events.add(that.socket);


    }



}

module.exports = IO;