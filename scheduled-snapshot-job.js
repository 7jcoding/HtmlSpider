/**
 * Snapshot system component for define snapshot job.
 * User: Evan Lou.
 * Date: 13-5-8
 * Time: 下午2:03
 */

var schedule = require('node-schedule'),
    util = require('util'),
    Spider = require('./spider-job')
    ;

var ScheduleSnapshotJob = function(args){
    if(args && args.url){
        this.url = args.url;
    }

    if(args && args.snapshotDir){
        this.snapshotDir = args.snapshotDir;
    }
}

// util.inherits(ScheduleSnapshotJob, schedule.Job);

ScheduleSnapshotJob.prototype.setUrl = function(url){
    this.url = url;
}

ScheduleSnapshotJob.prototype.setSnapshotDir = function(snapshotDir){
    this.snapshotDir = snapshotDir;
}

ScheduleSnapshotJob.prototype.buildJob = function (opt){
    var self = this;

    if (!self.url || !self.setSnapshotDir) {
        console.log('Url or snapshot save directory has not config, can not build snapshot job.');
        return;
    }

    if(opt){
        self.job = new schedule.Job('chuguoqu_snapshot_job', function(){
            new Spider.SpiderJob(opt).runAsyn();
        });
    }else{
        self.job = new schedule.Job('chuguoqu_snapshot_job', function(){
            new Spider.SpiderJob({is_auto_loop: true, url: self.url, snapshotDir: self.snapshotDir}).runAsyn();
        });
    }

}

exports.ScheduleSnapshotJob = ScheduleSnapshotJob;