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
    Url = require('url'),
    FastList = require("fast-list")
    ;

var SpiderJob = function(args){
    if(args && args.is_auto_loop){
        this.is_auto_loop = args.is_auto_loop;
    }

    if(args && args.urls){
        this.url = args.urls;
    }

    if(args && args.snapshotDir){
        this.snapshotDir = args.snapshotDir;
    }

    this.waitForCrawls = new FastList();
    this.crawledPages = []; //new FastList();
}

SpiderJob.prototype.setUrl = function(url){
    this.url = url;
}

SpiderJob.prototype.setSnapshotDir = function(snapshotDir){
    this.snapshotDir = snapshotDir;
}

SpiderJob.prototype.runAsyn = function (){
    var self = this;

    // post seed
    if(isArray(this.url)){
        for(var i=0; i<this.url.length; i++){
            self.waitForCrawls.push(self.url[i]);
        }
    }else {
        self.waitForCrawls.push(self.url);
    }

    self.startCrawlAsync();

    function isArray(o) {
        return Object.prototype.toString.call(o) === '[object Array]';
    }
}

SpiderJob.prototype.startCrawlAsync = function (){
    var self = this;

    var crawl = function(){
        console.log('crawl link length ' + self.waitForCrawls.length);
        var link = self.waitForCrawls.pop();
        if(link){
            console.log('begin crawl ' + link);

            // 验证是否已经爬过
            if(self.crawledPages.indexOf(link) > -1){
                //
                console.log('Url has crawled: ' + link);

                if(self.waitForCrawls.length > 0){
                    setTimeout(function(){
                        crawl();
                    }, 100);
                }else{
                    self.crawls--;
                }
            }else{
                self.loadSnapshotAndParserPageAsync(link, function(){
                    if(self.waitForCrawls.length > 0){
                        setTimeout(function(){
                            crawl();
                        }, 100);
                    }else{
                        self.crawls--;
                    }
                });
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

SpiderJob.prototype.loadSnapshotAndParserPageAsync = function(url, cb){
    var self = this;

    if (!url) {
        console.log('Url has not config, can not load web page.');
        return;
    }
    var isInProcess;
    async.series({
        createPhAndPage: function(callback){
            if(!self.ph){
                phantom.create(function(err, ph) {
                    self.ph = ph;
                    ph.createPage(function(err, page){
                        self.page = page;
                        callback();
                    });

                });
            }else{
                self.ph.createPage(function(err, page){
                    self.page = page;
                    callback();
                });
            }
        },
        doLoad: function(callback){
            self.page.onLoadFinished = function (status) {
                if (status && status == 'success') {
                    self.error = false;
                    callback();
                } else {
                    console.log(util.format('Web page url [%s] load error!', url));
                    self.error = true;
                    callback();
                }
            };

            self.page.onError = function(msg, trace) {
                console.log('error ' + msg);
                var msgStack = ['ERROR: ' + msg];
                if (trace) {
                    msgStack.push('TRACE:');
                    trace.forEach(function(t) {
                        msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function + '")' : ''));
                    });
                }

                console.error(msgStack.join('\n'));
            };

            self.page.open(url);
        },
        doSnapshot: function(callback){
            if(self.error){
                callback();
                return;
            }

            console.log(util.format('Do snapshot for url [%s].', url));

            setTimeout(function () {
                console.log(util.format('Snapshot time out is tirgger, [%s].', url));

                self.page.evaluate(function () {
                    return document.documentElement.outerHTML;
                },function(err, doc){
                    if(doc){
                        var filePath = buildSnapshotFileAndPath(url, self.snapshotDir);

                        fs.writeFile(filePath, doc, function(e){//会先清空原先的内容
                            if(e) throw e;
                            console.log(util.format('Snapshot file [%s] is created!', filePath));
                        });

                        callback();
                    }else{
                        console.error(util.format('Html snapshot on [%s] is empty', url));
                        callback();
                    }
                });

            }, 300);
        },
        doParser: function(callback){
            if(!this.is_auto_loop){
                callback();
                return;
            }

            if(self.error){
                callback();
                return;
            }

            console.log(util.format('Do parser page.'));

            self.page.evaluate(function() {
                return [].map.call(document.querySelectorAll('a'), function(link) {
                    return link.getAttribute('href');
                });
            }, function(err, links){
                if(links){
                    links.forEach(function(link, index, array){
                        var _href = link.toLowerCase(),
                            _url = Url.parse(url);
                        // filter  # and javascript:void(0) and so on
                        if(_href.indexOf('/') === 0){
                            // begin with /
                            _href = _url.protocol + '//' + _url.host + _href;
                        }

                        if(_href !== '' && _href !== '#' && _href.indexOf('javascript:') == -1){
                            console.log(util.format('get link [%s]', _href));
                        }

                        if((_href.indexOf('http://') > -1 || _href.indexOf('https://') > -1 ) &&
                            (_href.indexOf('localhost') > -1 || _href.indexOf('chuguoqu.com') > -1) &&
                            (_href.indexOf('community.chuguoqu.com') === -1) &&
                            (_href.indexOf('image.chuguoqu.com') === -1)){
                            // 合法的 url
                            console.log(util.format('parser link for crawl [%s]', _href));
                            self.postPages(_href);
                        }
                        if(index == array.length - 1){
                            console.log('all links are processed, exit.')
                            callback();
                        }
                    });
                }else{
                    console.log('page has no link, exit.');
                    callback();
                }
            });
        }
    }, function(err, results) {
        console.log('end series');
        self.page.close();
        self.crawledPages.push(url);
        if(cb){
            cb();
        }
    });

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
            toEscapes = ['\\', '\/', '\:', '\*', '\?', '"', '<', '>'],
            output = input;

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

SpiderJob.prototype.postPages = function (link){
    var self = this;

    if(self.crawledPages.indexOf(link) > -1){
        console.log(util.format('Link [%s] has crawled and return.', link));
        return;
    }

    var isExists = false;
    isExists = self.waitForCrawls.forEach(function(item, index, array){
        if(item == link){
            isExists = true;
            return true;
        }
    });

    if(!isExists){
        self.waitForCrawls.push(link);
    }

    self.startCrawlAsync();
};

exports.SpiderJob = SpiderJob;