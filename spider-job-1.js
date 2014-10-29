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
    phantom.create(function(err, ph) {
        return ph.createPage(function(err, page) {

            // iframe should be trigger muti
            page.onLoadFinished = function (status) {
                if (status && status == 'success') {
                    if(!isInProcess){
                        isInProcess = 1;
                        console.log(util.format('Web page url [%s] load finished.', url));
                        //self.snapshot(ph, page, url);

                            var doc = page.evaluate(function (s) {
                                return "page evaluate";
                            });

                            console.log(doc);
                    }else{
                        console.log(util.format('Web page url [%s] is in processing.', url));
                    }

                } else {
                    console.log(util.format('Web page url [%s] load error!', url));
                    // return;
                }
            };

            page.onError = function(msg, trace) {
                console.log('error');
                var msgStack = ['ERROR: ' + msg];
                if (trace) {
                    msgStack.push('TRACE:');
                    trace.forEach(function(t) {
                        msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function + '")' : ''));
                    });
                }
                console.error(msgStack.join('\n'));
            };

            page.open(url);
        });
    });
};

SpiderJob.prototype.snapshot = function (ph, page, url){
    var self = this;

    console.log(util.format('Do snapshot for url [%s].', url));

    setTimeout(function () {
        console.log(util.format('Snapshot time out is tirgger, [%s].', url));

        page.evaluate(function () {
            var filePath = buildSnapshotFileAndPath(url, self.snapshotDir);

            fs.writeFile(filePath, document.documentElement.outerHTML, function(e){//会先清空原先的内容
                if(e) throw e;
                console.log(util.format('Snapshot file [%s] is created!', filePath));
            });

            return document.documentElement.outerHTML;
        });

        self.parserPage(ph, page);
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

SpiderJob.prototype.parserPage = function (ph, page){
    var self = this;
    console.log(util.format('Do parser page.'));

    page.evaluate(function() {
        console.log(util.format('Do parser page evaluate.'));
        var links = document.querySelectorAll('a');
        links.forEach(function(link, index, array){
            var _href = link.getAttribute('href');
            if(_href.toLowerCase().indexOf('localhost') > -1 || _href.toLowerCase().indexOf('chuguoqu.com') > -1){
                // 合法的 url
                // _links.push(_href);
                console.log(util.format('parser link for crawl [%s]', _href));
                self.postPages(_href);
            }
            if(index == array.length - 1){
                ph.exit();
            }
        });

//        return _links;
    });
};

SpiderJob.prototype.postPages = function (link){
    var self = this;
//    links.forEach(function(link){
//        if(self.crawledPages.indexOf(link) > -1){
//            console.log(util.format('Link [%s] has crawled and return.', link));
//            return;
//        }
//
//        self.waitForCrawls.push(link);
//    });

    if(self.crawledPages.indexOf(link) > -1){
        console.log(util.format('Link [%s] has crawled and return.', link));
        return;
    }

    self.waitForCrawls.push(link);

    // comes new page start crawl
    if(self.crawls && self.crawls > 0){
        return;
    }else{
        self.startCrawl();
    }
};

SpiderJob.prototype.startCrawl = function (){
    var self = this;

    var crawl = function(){
        var link = self.waitForCrawls.pop();
        if(link){
            self.loadPage(link);

            setTimeout(function(){
                crawl();
            }, 100);
        }else{
            self.crawls--;
        }
    }

    if(!self.crawls){
        self.crawls = 0;
    }

    self.crawls++;
    crawl();
};

SpiderJob.prototype.run = function (){
    var self = this;

    // build seed
    self.waitForCrawls.push(self.url);

    // start crawl
    self.startCrawl();
}

exports.SpiderJob = SpiderJob;