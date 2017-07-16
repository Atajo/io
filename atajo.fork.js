const Log = require('./atajo.log');

var fs = require('fs');
var path = require('path');

var hasResponded = false;

class Fork {


    constructor(Lambda) {

        this.interface = Lambda;
        this.cachePath = path.join(__dirname, 'cache', 'tx');


        process.on('message', message => {

            switch (message.action) {
                case 'configure':
                    this.configure(message);
                    break;
                case 'rx':
                    this.rx(message.request);
                    break;
            }
        });

    }

    configure(message) {


        //SET GLOBALS
        global.release = message.release || 'dev';
        global.domain = message.domain;
        global.config = require('./config');
        global.log = new Log(release, config.get("LOGPATH") || path.join(__dirname, 'logs'));

        var DBI = require('./dbi');
        let dbi = new DBI();
        dbi.init().then(() => {

            dbi.connect('mongodb://localhost/' + domain + '_' + release).then((models) => {

                global.dbi = models;

                let api = false; // TODO : BIND API

                //LEGACY HANDLER SHIM --> DEPRECATING
                if (this.interface.init) {
                    log.warn("YOUR HANDLER IS OUT OF DATE AND IT'S IMPLEMENTATION IS MARKED FOR DEPRECATION. PLEASE SEE ES6 HANDLER STRUCTURE FOR FUTURE HANDLER DEVELOPMENT");
                } else {
                    this.lambda = new this.interface(api);
                }


            })


        })






    }

    rx(data) {


        if (!data || !data.pid) return log.warn("INVALID LAMBDA REQUEST -> DROPPING : ", data);

        this.transaction = data;

        log.debug("TRANSACTION IS ", data);




        data.request.resolve = (response) => {
            this.resolve(response, false);
        };

        data.request.reject = (error) => {
            this.resolve(error, true);
        };




        try {

            //// LEGACY SUPPORT -> REMOVE FOR DEPRECATION
            if (this.interface.init) {
                this.lambda = this.interface.init(data.request, response => {
                    this.resolve(response, !response.RESPONSE);
                });
                this.lambda.req();
            } else {
                this.lambda = new this.interface(api);
                this.lambda.request(data.request);
            }


        } catch (e) {
            log.error("FORK:LAMBDA REQUEST ERROR  ", e.stack);
        }
    }

    resolve(response, error) {

        if (!response.RESPONSE) {
            response = response.MESSAGE
        } else {
            response = response.RESPONSE;
        }


        log.debug("GOT HANDLER RESULT (ERROR : " + error + ")", response);
        let pid = this.transaction.pid;

        if (!response) {
            log.error("FORK:LAMBDA:RESOLVE NO RESPONSE -> DROPPING PID ", pid);
            return;
        }

        if (typeof response === 'string') {
            response = [response];
        }


        response = this.chunkResponse(pid, response);
        if (response) {

            try {
                process.send({
                    error: error ? 1 : 0,
                    pid: pid,
                    response: response,
                    version: this.transaction.version,
                    latency: this.transaction.latency
                });
            } catch (e) {
                log.error("FORK:LAMBDA:RESOLVE COULD NOT RESPOND TO PROVIDER CONTROLLER -> ", e.stack);

            }

        }
        /*
                var cachedResponseFile = path.join(this.cachePath, pid + '.json');

                fs.writeFile(cachedResponseFile, responseString, function(err) {
                    if (err) {
                        log.error("FORK.L:LAMBDA:RESOLVE COULD NOT WRITE RESPONSE TO CACHE FOR " + fnam, err);
                        process.exit(1);
                    }

                    try {
                        process.send({
                            status: error ? 1 : 0,
                            type: 'pid',
                            pid: pid
                        });
                    } catch (e) {
                        log.error("FORK:LAMBDA:RESOLVE COULD NOT RESPOND TO PROVIDER CONTROLLER -> " + e);

                    }

                });
        */
    }

    //TODO
    chunkResponse(pid, response, chunkSize = 2000000) {

        try {

            if (!Array.isArray(response)) {
                log.error("RESPONSE IS NOT A STRING OR ARRAY - NOT CHUNKING - PLEASE ENSURE OBJECT EMITS ARE 1MB or less");
                let chunkFileName = path.join(this.cachePath, pid + '.0.chunk');
                fs.writeFileSync(chunkFileName, JSON.stringify(response));

                return {
                    chunkTotal: 1,
                    pid: pid
                }

            }




            let responseString = JSON.stringify(response);

            let byteLength = responseString.length;
            let responseData = response;

            let elementsInArray = responseData.length;

            let bytesPerElement = byteLength / elementsInArray;

            let arrayElementsPerChunk = 1;
            if (bytesPerElement < chunkSize) {
                arrayElementsPerChunk = Math.round(chunkSize / bytesPerElement);
            }

            log.debug("CHUNKING RESPONSE ARRAY OF " + elementsInArray + " ELEMENTS");
            log.debug("      @ ~ " + bytesPerElement + " bytes PER ELEMENT ");
            log.debug("      WITH DESIRED CHUNK SIZE OF " + chunkSize + " bytes PER CHUNK");
            log.debug("      AND A CALCULATED " + arrayElementsPerChunk + " ARRAY ELEMENTS PER CHUNK");

            let chunks = [];

            for (let i = 0, j = elementsInArray; i < j; i += arrayElementsPerChunk) {

                chunks.push(responseData.slice(i, i + arrayElementsPerChunk));

            }

            log.debug("WE HAVE " + chunks.length + " CHUNKS : ", chunks);


            for (let i = 0; i < chunks.length; i++) {
                let chunkFileName = path.join(this.cachePath, pid + '.' + i + '.chunk');
                log.debug("WRITING CHUNK : ", JSON.stringify(chunks[i]));
                fs.writeFileSync(chunkFileName, JSON.stringify(chunks[i]));
                /*
                                fs.writeFile(chunkFileName, JSON.stringify(chunks[i]), function(err) {
                                    if (err) {
                                        log.error("COULD NOT WRITE CHUNK TO CACHE FOR " + chunkFileName, err);
                                    }
                                }); */
            }


            return {
                chunkTotal: chunks.length,
                pid: pid
            }


        } catch (e) {

            log.error("COULD NOT CHUNK RESPONSE. DROPPING. ", e.stack);
            return false;

        }



    }


}



exports.bind = (Lambda) => {

    let fork = new Fork(Lambda);
}