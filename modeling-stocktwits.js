// DEPENDENCIES
var st = require('stocktwits');
//var sleep = require('sleep');
var fs = require('fs');
var path = require('path');
var async = require('async');
var _ = require('lodash');

// CONFIG
var stop = false;
// Limit of unauthorized calls
var limitUnauth = 200;
var thresholdUnauth = limitUnauth - (limitUnauth/100) * 10;
var programAverageCalls = 30;
var ensuranceCalls = 30;
var ensuranceImmediateStop = 5;
var limitThreshold = programAverageCalls + ensuranceCalls;
var immediatelyStopThreshold = programAverageCalls + ensuranceImmediateStop;

var ensuranceSleep = 60 * 10; // seconds
var waitLimit = 60*60 + ensuranceSleep;
var waitUpdates = 60*5;

var msgsFolder = 'msgs';
var usersFolder = 'users';
var msgsPath = path.join(__dirname, msgsFolder);
var usersPath = path.join(__dirname, usersFolder);
var symbol = 'BTC.X'
var symbolURL = path.join('streams/symbol', symbol);
var userURL = 'streams/user/'


// PRE
// Check folders
if (!fs.existsSync(msgsPath)) {
  fs.mkdirSync(msgsPath);
}

if (!fs.existsSync(usersPath)) {
  fs.mkdirSync(usersPath);
}

// FUNCTIONS

// store msgs. We need to check if the same msgs is already saved
function storeMsgs(msgs, cb) {
  if (!msgs) {
    return cb();
  }
  // get msg IDs
  alreadyDownloadedMsgs = fs.readdirSync(msgsPath);

  var newMsgs = _.filter(msgs, function predicate(msg) {
    return !alreadyDownloadedMsgs.includes(msg.id.toString());
  });

  console.log(newMsgs.length + ' new messages found');

  async.each(newMsgs, function onNewMsg(msg, callback) {
    fs.writeFile(path.join(msgsPath, msg.id.toString()), JSON.stringify(msg), callback);
  }, cb);
}

// Store users
function storeUsers(users, cb) {
  async.each(users, function onUsr(usr, callback) {
    fs.writeFile(path.join(usersPath, usr.id.toString()), JSON.stringify(usr), callback);
  }, cb);
}

// store msgs and users
// we already know that the users are new, while we need to check if the msgs are
// already stored
function store(toStore, cb) {
  async.parallel([
    function (callback) {
      storeMsgs(toStore.msgs, callback);
    },
    function(callback) {
      storeUsers(toStore.users, callback);
    }
  ], cb);
}

// get an array of ID that are already downloaded
function getDownloadedUsersSync() {
  var downloadedUsers = [];
  return fs.readdirSync(usersPath);
}

function nextScrape(cb) {
  if (stop) {
    console.log('I am near the API limit. It is better to sleep a bit more');
    timeToSleep = waitLimit;
  } else {
    timeToSleep = waitUpdates;
  }

  console.log("I'm going to sleep for " + timeToSleep + "s...");
  console.log("You can turn me off safely while I'm sleeping");
  /*
  sleep.sleep(timeToSleep);
  stop = false;
  console.log("Good morning again! DO NOT turn me off!");
  return cb();
  */
  setTimeout(function afterSleep() {
    stop = false;
    console.log("Good morning again! DO NOT turn me off!");
    return cb();
  }, timeToSleep * 1000)
}

function getData(next) {
  st.get(symbolURL, function onRes(err, res) {
    if (err) {
      return next(err);
    }

    msgs = res.body.messages;
    if (!msgs) {
      return next('No messages found');
    }

    console.log('Most recent messages dowloaded');

    // check API limit
    console.log("Remaining: " + res.remaining);
    console.log("Limit Threshold: " + limitThreshold);
    if (res.remaining <= limitThreshold) {
      // After having downloaded all the users, the program will sleep
      stop = true;
    }

    if (res.remaining <= immediatelyStopThreshold) {
      stop = true;
      return nextScrape(next);
    }

    var toStore = {
      'msgs': msgs,
      'users': [],
    };

    var downloadedUsers = getDownloadedUsersSync();
    var usersToDownload = [];

    _.forEach(msgs, function onMsg(msg) {
      userID = msg.user.id.toString();
      if (!downloadedUsers.includes(userID)) {
        usersToDownload.push(userID);
      }
    });

    console.log('Start downloading ' + usersToDownload.length + ' users');

    async.each(usersToDownload, function onUserID(userID, cb) {
      var url = userURL + userID.toString();
      st.get(url, function onRes(err, res) {
        if (err) {
          return cb(err);
        }

        res = res.body;

        if (res.user) {
          toStore.users.push(res.user);
        }
        return cb()
      });
    }, function onEnd(err) {
      if (err) {
        return next(err);
      }

      console.log('All users downloaded');
      store(toStore, function onEnd(err) {
        if (err) {
          return next(err);
        }

        console.log('All data stored');

        nextScrape(next);
      });
    });
  });
}

// BODY
async.forever(getData, function onError(err) {
  console.log('An error occured:\n')
  console.log(err);
});

// var callsUnauth = 0
// while (true) {
//   if (callsUnauth >= thresholdUnauth) {
//     sleep.sleep(sleepTime)
//   }
//
//
// }
