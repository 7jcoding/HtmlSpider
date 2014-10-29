/**
 * Coala front component.
 * User: Evan Lou.
 * Date: 13-5-8
 * Time: 上午8:59
 */
var schedule = require('node-schedule'),
    Snapshot = require('./scheduled-snapshot-job');

var snapshotJob = new Snapshot.ScheduleSnapshotJob({url:'http://localhost:6176/Index/new', snapshotDir: 'D:\\dev\\help\\js\\snapshot\\server\\snapshots'});

var opt = {
    is_auto_loop: true, // 自动爬行页面所有链接
    urls: ['http://localhost:6176/Index/new'], // 待爬行列表
    snapshotDir: 'D:\\dev\\help\\js\\snapshot\\server\\snapshots'
}

snapshotJob.buildJob(opt);

var rule = new schedule.RecurrenceRule();
// rule.dayOfWeek = [0, new schedule.Range(4, 6)];
rule.hour = 16;
rule.minute = 41;

var date = new Date(2013, 5, 8, 16, 31, 0);
snapshotJob.job.schedule(date);