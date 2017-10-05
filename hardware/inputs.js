require('rootpath')();
var INPUTS_BIN_PATH = "/home/view/current/bin/inputs";
var GESTURE_BIN_PATH = "/home/view/current/bin/gesture";
//var GestureLib = require('apds-gesture');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
//var Button = require('gpio-button');
var Button = require('hardware/button.js').Button;

var db = require("system/db.js");
var EventEmitter = require("events").EventEmitter;

var inputs = new EventEmitter();

var GESTURE_INT_GPIO = 72;//PC8
var GESTURE_I2C_BUS = 2;

//var gesture = GestureLib.use(GESTURE_I2C_BUS, GESTURE_INT_GPIO);

//gesture.on('ready', function() {
//    console.log("INPUTS: found a gesture sensor");
//});

//gesture.on('error', function(err) {
//    console.log("INPUTS: Gesture Error: ", err);
//});

//gesture.on('movement', function(dir) {
//    inputs.emit('G', dir.substr(0, 1).toUpperCase());
//});

var inputsProcess = null;
var inputsRunning = false;
var gestureProcess = null;
var gestureRunning = false;

var stop = false;
var stopGesture = false;

var HOLD_TIME = 1500;

var KNOB_PIN = 35;
var POWER_PIN = 36;
var BACK_PIN = 37;
var ENTER_PIN = 40;
var MENU_PIN = 38;


var POWER = 5;
var BACK = 1;
var ENTER = 2;
var MENU = 3;
var KNOB = 4;

var knobButton = new Button(KNOB_PIN);
knobButton.on('press', function(){
    inputs.emit('B', KNOB);
});

var backButton = new Button(BACK_PIN);
backButton.on('press', function(){
    inputs.emit('B', BACK);
});

var enterButton = new Button(ENTER_PIN);
enterButton.on('press', function(){
    inputs.emit('B', ENTER);
});

var powerButton = new Button(POWER_PIN);
powerButton.on('press', function(){
    inputs.emit('B', POWER);
});

var menuButton = new Button(MENU_PIN);
menuButton.on('press', function(){
    inputs.emit('B', MENU);
});

function setupButton(buttonsConfig) {
    for(var key in buttonsConfig)
    {
        var buttonConfig = buttonsConfig[key];
        console.log(buttonConfig);
        var button =  new Button(buttonConfig.pin);
        var pressed = buttonConfig.pressed;
        button.on('press', function(){
            console.log(buttonConfig, pressed);
            inputs.emit('B', pressed);
        });

        buttonConfig.button = button;
    }
/*    buttonConfig._button = new Button(buttonConfig.platformEvent);

    buttonConfig._btnPowerPressedTimer = null;
    buttonConfig._button.on('press', function(code) {
        if(code && buttonConfig[code]) {
            //console.log("button", buttonConfig[code].name, "pressed");
            buttonConfig[code]._pressed = true;
            inputs.emit('B', buttonConfig[code].pressed);
            if(buttonConfig[code]._btnPowerPressedTimer != null) clearTimeout(buttonConfig[code]._btnPowerPressedTimer);
            buttonConfig[code]._btnPowerPressedTimer = setTimeout(function(){
                inputs.emit('B', buttonConfig[code].held);
            }, HOLD_TIME);
        }
    });

    buttonConfig._button.on('release', function(code) {
        if(code && buttonConfig[code]) {
            //console.log("button", buttonConfig[code].name, "released");
            buttonConfig[code]._pressed = false;
            if(buttonConfig[code]._btnPowerPressedTimer != null) clearTimeout(buttonConfig[code]._btnPowerPressedTimer);
        }
    });

    buttonConfig._button.on('error', function(err) {
        console.log("button error: ", buttonConfig.name, err);
    });
    */
}


exec("killall gesture");
exec("killall inputs");
var options = {};
var mcuSetup = false;
inputs.start = function(knobOptions) {
    options = knobOptions;
    /*if(knobOptions.knob) {
        stop = false;
        if(inputsRunning) return;
        inputsProcess = spawn(INPUTS_BIN_PATH);
        inputsRunning = true;
        console.log("inputs process started");
        inputsProcess.stdout.on('data', function(chunk) {
            //console.log("inputs stdin: " + chunk.toString());
            var matches = chunk.toString().match(/([A-Z])=([A-Z0-9\-]+)/);
            if (matches && matches.length > 1) {
                if(matches[1] == 'D') {
                    var dir = matches[2];
                    if(buttons['4']._pressed) dir += "+";
                    inputs.emit('D', dir);
                }
            }
        });
        inputsProcess.stderr.on('data', function(chunk) {
            console.log("inputs stderr: " + chunk.toString());
            chunk = null;
        });
        inputsProcess.on('close', function(code) {
            console.log("inputs process exited");
            inputsRunning = false;
            if (!stop) {
                setTimeout(function() {
                    if(!stop) inputs.start();
                }, 500);
            }
        });
    } else if(options.mcu) {
        */
        if(mcuSetup) return;
        mcuSetup = true;
        options.mcu.on('knob', function(val) {
            k = 'U';
            if(val < 0) {
                k = 'D';
            }
            if(knobButton.IsPressed) k += "+";
            inputs.emit('D', k);
            console.log('D', k);
        });
   // }
}

inputs.startGesture = function() {
    inputs.gestureStatus = "enabled";
    db.get('gestureCalibration', function(err, gestureCalibration) {
        if(err || !gestureCalibration) gestureCalibration = {};
        gesture.setup(gestureCalibration, function(){
            console.log("INPUTS: starting gesture sensor", (gestureCalibration.gUOffset ? "(calibrated)" : ""));
            gesture.start();
        });
    });
}
inputs.calibrateGesture = function(statusCallback) {
    gesture.calibrate(function(err, status, calResults) {
        if(calResults) {
            db.set('gestureCalibration', calResults);
            gesture.start();
        } else if(err) {
            console.log("INPUTS: error calibrating gesture: ", err);
        }
        statusCallback && statusCallback(err, status, (calResults || err) ? true : false);
    });
}

inputs.stop = function(callback) {
    process.nextTick(function(){
        stop = true;
        stopGesture = true;
        if (inputsRunning) {
            console.log("inputs process exiting...");
            try {
                inputsProcess.stdin.write('\n\n\n');
                inputsProcess.stdin.end();
            } catch (e) {
                console.log("input close error: ", e);                
                setTimeout(function(){
                    inputsProcess.kill();
                }, 1000);
            }
        }
        inputs.stopGesture();
        if(callback) setTimeout(callback, 100); // give time for processes to exit
    });
}

inputs.stopGesture = function() {
    inputs.gestureStatus = "disabled";
    gesture.stop();
    gesture.disable();
}

module.exports = inputs;
