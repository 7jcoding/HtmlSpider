/**
 * Snapshot system component for define snapshot job.
 * User: Evan Lou.
 * Date: 13-5-8
 * Time: 上午9:29
 */
var schedule = require('node-schedule'),
    util = require('util'),
    phantom = require('node-phantom'),
    fs = require('fs'),
    async = require('async'),
    FastList = require("fast-list")
    ;

var SpiderJob = function(args){
    if(args && args.url){
        this.url = args.url;
    }

    if(args && args.snapshotDir){
        this.snapshotDir = args.snapshotDir;
    }

    this.waitForCrawls = new FastList();
    this.crawledPages = [];
}

util.inherits(SpiderJob, schedule.Job);

SpiderJob.prototype.setUrl = function(url){
    this.url = url;
}

SpiderJob.prototype.setSnapshotDir = function(snapshotDir){
    this.snapshotDir = snapshotDir;
}

/**
 * Load special page.
 * @param url page url
 */
SpiderJob.prototype.loadPage = function(url){
    var self = this;
    if (!url) {
        console.log('Url has not config, can not load web page.');
        return;
    }

    console.log('begin to load url: ' + url);
    var isInProcess;

    async.series({
        createPhantom: function(callback){
            if(!self.ph){
                phantom.create(function(err, ph) {
                    self.ph = ph;
                    callback();
                });
            }else{
                callback();
            }
        },
        loadAndParserPage: function(callback){
            //
            // return ph.createPage(creatPageCallback);
            self.ph.createPage(creatPageCallback);
            callback();
        }
    },
    function(err, results) {
        console.log('end series');
    });

    function creatPageCallback(err, page){
        // iframe should be trigger muti
        page.onLoadFinished = function (status) {
            if (status && status == 'success') {
                if(!isInProcess){
                    isInProcess = 1;
                    console.log(util.format('Web page url [%s] load finished.', url));
                    self.snapshot(page, url);
                }else{
                    console.log(util.format('Web page url [%s] is in processing.', url));
                }

            } else {
                console.log(util.format('Web page url [%s] load error!', url));
                // return;
                page.close();
            }
        };

        page.onError = function(msg, trace) {
            console.log('error ' + msg);
            var msgStack = ['ERROR: ' + msg];
            if (trace) {
                msgStack.push('TRACE:');
                trace.forEach(function(t) {
                    msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function + '")' : ''));
                });
            }

            console.error(msgStack.join('\n'));

            setTimeout(function(){
                page.close();
            }, 20000);
        };

        page.open(url);
    }
};

SpiderJob.prototype.snapshot = function (page, url){
    var self = this;

    console.log(util.format('Do snapshot for url [%s].', url));

    setTimeout(function () {
        console.log(util.format('Snapshot time out is tirgger, [%s].', url));

        page.evaluate(function () {
            return document.documentElement.outerHTML;
        },function(err, doc){
            if(doc){
                var filePath = buildSnapshotFileAndPath(url, self.snapshotDir);

                fs.writeFile(filePath, doc, function(e){//会先清空原先的内容
                    if(e) throw e;
                    console.log(util.format('Snapshot file [%s] is created!', filePath));
                });
            }else{
                console.error(util.format('Html snapshot on [%s] is empty', url));
            }
        });

        self.parserPage(page);
    }, 3000);

    /**
     * Build the file path of snapshot for url.
     */
    function buildSnapshotFileAndPath(_url, snapshotDir){
        var fileName, filePath,
            self = this;

        fileName = escapeFileName(_url);

        filePath = snapshotDir;
        if(filePath.indexOf('\\', filePath.length - 1) === -1){
            filePath += '\\';
        }

        if(!fs.existsSync(filePath)){
            fs.mkdirSync(filePath);
        }

        return filePath + fileName;
    }

    /**
     * Escape url to suitable file name.
     * @param input input url
     * @return {*} output file name
     */
    function escapeFileName(input){
        var toEscape = '\\ / : * ? " < >',
        //toEscapes = toEscape.split(' '),
            toEscapes = ['\\', '\/', '\:', '\*', '\?', '"', '<', '>'],
            output = input;

//        toEscapes.forEach(function(item){
//            // output = output.replace(new RegExp(item, 'gm'), '_');
//            output = output.replace(item, '_');
//            console.log(output);
//        });
        console.log(output);
        output = output.replace(/\\/ig, '_');
        output = output.replace(/\//ig, '_');
        output = output.replace(/:/ig, '_');
        output = output.replace(/\*/ig, '_');
        output = output.replace(/\?/ig, '_');
        output = output.replace(/"/ig, '_');
        output = output.replace(/</ig, '_');
        output = output.replace(/>/ig, '_');
        console.log(output);

        return output;
    }
};

SpiderJob.prototype.parserPage = function (page){
    var self = this;
    console.log(util.format('Do parser page.'));

    page.evaluate(function() {
        return [].map.call(document.querySelectorAll('a'), function(link) {
            return link.getAttribute('href');
        });
    }, function(err, links){
        if(links){
            links.forEach(function(link, index, array){
                var _href = link.toLowerCase();
                console.log(util.format('get link [%s]', _href));
                if((_href.indexOf('http://') > -1 || _href.indexOf('https://') > -1 )&& (_href.indexOf('localhost') > -1 || _href.indexOf('chuguoqu.com') > -1)){
                    // 合法的 url
                    console.log(util.format('parser link for crawl [%s]', _href));
                    self.postPages(_href);
                }
                if(index == array.length - 1){
                    console.log('all links are processed, exit.')
                    // self.ph.exit();
                    page.close();
                }
            });
        }else{
            console.log('page has no link, exit.');
            // ph.exit();
            page.close();
        }
    });
};

SpiderJob.prototype.postPages = function (link){
    var self = this;

    if(self.crawledPages.indexOf(link) > -1){
        console.log(util.format('Link [%s] has crawled and return.', link));
        return;
    }

    self.waitForCrawls.push(link);

    self.startCrawl();
};

SpiderJob.prototype.startCrawl = function (){
    var self = this;

    var crawl = function(){
        console.log('crawl link length ' + self.waitForCrawls.length);
        console.log('total crawl: ' + self.crawls);
        var link = self.waitForCrawls.pop();
        if(link){
            console.log('begin crawl ' + link);
            self.loadPage(link);

            if(self.waitForCrawls.length > 0){
                setTimeout(function(){
                    crawl();
                }, 100);
            }else{
                self.crawls--;
            }
        }else{
            self.crawls--;
        }
    }

    if(!self.crawls){
        self.crawls = 0;
    }

    if(self.crawls < 1){
        crawl();
        self.crawls++;
    }
};

SpiderJob.prototype.run = function (){
    var self = this;

    // build seed
    self.waitForCrawls.push(self.url);

    // start crawl
    self.startCrawl();
}

exports.SpiderJob = SpiderJob;