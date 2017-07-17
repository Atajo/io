const path = require('path');
const fs = require('fs');

class Events {


    constructor() {

        this.cache = {};
        this.cachePath = path.join(__dirname, 'cache');
        this.cacheTXPath = path.join(this.cachePath, 'tx');

        fs.exists(this.cachePath, (exists) => {
            if (!exists) {
                fs.mkdirSync(this.cachePath);
                fs.mkdirSync(this.cacheTXPath);
            }
        });
    }


    add(socket) {

        this.socket = socket;

        socket.on('disconnect', data => {
            log.debug('CORE DISCONNECT - PLEASE MAKE SURE THE SUPPLIED SECRET KEY IS VALID');
            process.exit(1);
        });

        socket.on('client:connect', data => {
            log.debug('client:connect', data);
        });

        socket.on('client:disconnect', data => {
            log.debug('client:disconnect', data);
        });

        socket.on('provider:rx', rx => {

            rx = this.processLatency(rx, 'rx');
            this.providerRx(rx);
        });

    }

    providerRx(rx) {

        try {

            rx = this.verifyTransaction(rx);
            if (!rx) {
                log.error("EVENTS:PROVIDER:RX INVALID REQUEST", rx);
                return;
            }

            log.debug("RX IS ", rx);
            let lambda = rx.lambda;
            log.debug("LAMBDA IS ", lambda);


            if (this.cache[lambda]) {

                log.debug("SENDING TO CACHED LAMBDA " + lambda);

                //SEND REQUEST TO PROCESS
                try {
                    this.cache[lambda].send({
                        action: 'rx',
                        request: rx
                    });
                } catch (e) {
                    this.spawnHandler(lambda, rx);
                }

            } else {
                log.debug("SPINNING UP LAMBDA " + lambda);
                this.spawnHandler(lambda, rx);
            }


        } catch (e) {

            log.error("EVENTS:PROVIDER:RX ", e);

        }

    }

    providerTx(tx) {

        try {

            tx = this.verifyTransaction(tx);
            if (!tx) {
                log.error("EVENTS:PROVIDER:TX INVALID RESPONSE (NO PID)", rx);
                return;
            }

            //GET THE FIRST CHUNK'S DATA
            let firstChunk = path.join(this.cacheTXPath, tx.pid + '.0.chunk');

            fs.readFile(firstChunk, 'utf8', (err, data) => {

                if (err) {
                    log.error("CHUNK @ " + firstChunk + " NOT FOUND. DROPPING");
                    return;
                }

                //CREATE THE PAYLOAD

                try { data = JSON.parse(data); } catch (e) { log.warn("COULD NOT PARSE CHUNK"); }


                let response = {
                    error: tx.error,
                    version: tx.version,
                    pid: tx.pid,
                    response: {
                        chunkTotal: tx.response.chunkTotal,
                        chunkId: 0,
                        data: data
                    },
                    latency: tx.latency
                }

                response = this.processLatency(response, 'tx');
                this.socket.emit('provider:tx', response);


            });




        } catch (e) {


        }





    }

    spawnHandler(name, rx) {


        let lambdaFile = path.join(__dirname, '../', 'lambdas', name + '.js');
        fs.exists(lambdaFile, (exists) => {

            if (!exists) {
                log.error("LAMBDA FOR " + name + " (lambdas/" + name + ".js) NOT FOUND");
                return;
            }

            try {

                log.debug("FORKING PROCESS FOR " + name + "@" + lambdaFile);

                let fork = require('child_process').fork;
                this.cache[name] = fork(lambdaFile);

                this.cache[name].send({
                    action: 'configure',
                    release: release,
                    domain: domain

                });

                this.cache[name].send({
                    action: 'rx',
                    request: rx
                });

                //GET RESPONSE FORM PROCESS
                this.cache[name].on('message', msg => {

                    log.debug("GOT RESPONSE FROM HANDLER ", msg);

                    this.providerTx(msg);
                    //CREATE THE PAYLOAD




                });



            } catch (e) {

                log.error("COULD NOT SPAWN HANDLER", e.stack);

            }



        })




    }

    verifyTransaction(obj) {

        return obj.pid ? obj : false


    }


    processLatency(obj, type) {

        try {
            if (obj) {
                if (type == 'rx') {
                    obj.latency.providerReceiveAt = new Date().getTime();
                } else {
                    obj.latency.providerResponseAt = new Date().getTime();
                }
            }
        } catch (e) {
            log.error("COULD NOT ADD LATENCY " + type + " TO ", obj);
        }

        return obj;

    }


}

module.exports = Events;