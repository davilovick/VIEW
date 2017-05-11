var Wireless = require('wireless');
var exec = require("child_process").exec;
var fs = require('fs');
var EventEmitter = require("events").EventEmitter;

var wifi = new EventEmitter();

var ENABLE_AP = "/bin/sh /home/view/current/bin/enable_ap.sh";
var DISABLE_AP = "/bin/sh /home/view/current/bin/disable_ap.sh";
var WIFI_SHUTDOWN = "sudo modprobe -r 8723bu";
var WIFI_POWERON = "sudo modprobe 8723bu";
var BT_RESET = "sudo rfkill block bluetooth; sleep 1; sudo rfkill unblock bluetooth";
var BT_BLOCK = "sudo rfkill block bluetooth;";
var BT_UNBLOCK = "sudo rfkill unblock bluetooth;";
var BT_DISABLE = BT_BLOCK;//"sudo modprobe -r btusb";
var BT_ENABLE = BT_UNBLOCK;//"sudo modprobe btusb";

var iw = new Wireless({ iface:'wlan0', iface2: false, updateFrequency: 60, connectionSpyFrequency: 10 });

var dualInterface = false;

var hostapdConfig = "# Autogenerated by wifi.js\n\ninterface=wlan0\n\
ctrl_interface=/var/run/hostapd\n\
ssid={SSID}\n\
#wpa=2\n\
#wpa_psk=c1381810ba811147915d9f158d6254eb868808576ac550274cefe5bb776e5216\n\
country_code=US\n\
channel={CHANNEL}\n\
hw_mode=g\n\
#wpa_key_mgmt=WPA-PSK\n\
#wpa_pairwise=TKIP\n\
#rsn_pairwise=CCMP\n\
#auth_algs=1\n\
#macaddr_acl=0\n\
#wmm_enabled=1\n";

var HOSTAPD_CONFIG_PATH = "/etc/hostapd/hostapd.conf";

var list = {};
var listCallback = null;

wifi.apMode = false;
wifi.enabled = false;
wifi.connected = false;
wifi.list = [];
wifi.btEnabled = false;


function hostApdConfig(ssid, channel, callback) {
	console.log("WIFI: configuring AP with SSID '" + ssid + "' on channel " + channel);
	var content = hostapdConfig.replace('{SSID}', ssid);
	content = content.replace('{CHANNEL}', channel.toString());
	fs.writeFile(HOSTAPD_CONFIG_PATH, content, function(err) {
		callback && callback(err);
	});
}

function powerControl(enable, callback) {
	if(wifi.power) {
		wifi.power.wifi(enable, callback);
	} else {
		if(enable) {
			exec(WIFI_POWERON, callback);
		} else {
			exec(WIFI_SHUTDOWN, callback);
		}
	}
}

function updateExportedList() {
	wifi.list = [];
	for(var i in list) {
		wifi.list.push(list[i]);
	}
}

iw.on('appear', function(network) {
	//console.log("[Wifi] Appear:", network);
	list[network.address] = network;
	updateExportedList();
	if(listCallback) listCallback(wifi.list);
});

iw.on('change', function(network) {
	//console.log("[Wifi] Change:", network);
	list[network.address] = network;
	updateExportedList();
});

iw.on('signal', function(network) {
	//console.log("[Wifi] Signal:", network);
	list[network.address] = network;
	updateExportedList();
});

iw.on('vanish', function(network) {
	//console.log("[Wifi] Vanish:", network);
	delete list[network.address];
	updateExportedList();
	if(listCallback) listCallback(wifi.list);
});

iw.on('error', function(err) {
	console.log("[Wifi] Error:", err);
});

iw.on('empty', function() {
	//console.log("[Wifi] Empty");
	list = {};
	wifi.list = [];
	if(listCallback) listCallback(wifi.list);
});

iw.on('join', function(data) {
	console.log("[Wifi] Join:", data);
	wifi.connected = data;
	wifi.emit("connect", data.ssid);
	if(dualInterface && wifi.connected.channel && wifi.apMode) {
		wifi.enableAP(); // resets the AP to use the current channel
	}
});

iw.on('former', function(data) {
	console.log("[Wifi] Former:", data);
	wifi.connected = data;
	wifi.emit("connect", data.ssid);
});

iw.on('leave', function() {
	console.log("[Wifi] Leave");
	if(wifi.connected) {
		wifi.emit("disconnect", wifi.connected);
	}
	wifi.connected = false;
});

iw.on('stop', function() {
	console.log("[Wifi] Stop");
	wifi.scanning = false;
});

iw.on('command', function(cmd) {
	//console.log("[Wifi] Command: ", cmd);
});

wifi.listHandler = function(callback) {
	if(callback) {
		listCallback = callback;
		listCallback(wifi.list);
	} else {
		listCallback = null;
	}
}

wifi.scan = function() {
	iw.scanning = true;
	iw.start();
}

wifi.stop = function() {
	iw.scanning = false;
	iw.stop();
}

wifi.enableBt = function(cb) {
	wifi.btEnabled = true;
	exec(BT_ENABLE, function(err) {
		if(cb) cb(err);
	});
}

wifi.disableBt = function(cb) {
	wifi.btEnabled = false;
	exec(BT_DISABLE, function(err) {
		if(cb) cb(err);
	});
}

wifi.resetBt = function(cb) {
	exec(BT_RESET, function(err) {
		if(cb) cb(err);
	});
}

wifi.blockBt = function(cb) {
	exec(BT_BLOCK, function(err) {
		if(cb) cb(err);
	});
}

wifi.unblockBt = function(cb) {
	exec(BT_UNBLOCK, function(err) {
		if(cb) cb(err);
	});
}

wifi.powerCycle = function(cb) {
	wifi.disable(function(){
		wifi.enable(cb);
	}, true);
}

wifi.enable = function(cb) {
	powerControl(true, function(err) {
		iw.enable(function(err) {
			if(!err) {
				if(!wifi.btEnabled) wifi.disableBt();
				exec("iw wlan0 set power_save off" + (dualInterface ? "; ifconfig wlan1 down" : ""), function(err) {
					wifi.enabled = true;
					wifi.emit('enabled', true);
					wifi.scan();
					if(cb) cb(err);
				});
			} else {
				console.log("Error Enabling WiFi:", err);
				if(cb) cb(err);
			}
		});
	});
}

wifi.disable = function(cb, disableEvents) {
	var disable = function() {
		wifi.disconnect();
		wifi.stop();
		iw.disable(function(){
			if(!disableEvents) wifi.enabled = false;
			powerControl(false, function(err) {
				if(!disableEvents) wifi.emit('disabled', false);
				if(cb) cb(err);
			});
		});
	}
	if (wifi.apMode) {
		wifi.disableAP(disable);
	} else {
		disable();
	}
}

wifi.connect = function(network, password, callback) {
	var join = function() { 
		iw.join(network, password, function(){
			iw.dhcp(function(){
				if(callback) callback();
			});
		});
	};
	if(wifi.apMode && !dualInterface) {
		wifi.disableAP(function(){
			wifi.powerCycle(function(){
				setTimeout(join, 2000);
			});
		});		
	} else {
		wifi.disconnect(function() {
			setTimeout(join, 2000);
		});
	}
}

wifi.disconnect = function(callback) {
	if(wifi.connected) {
		wifi.connected = false;
		wifi.emit("disconnect", false);
	}
	iw.dhcpStop(function(){
		//console.log("[Wifi] Stopped DHCP, leaving wifi network...")
		iw.leave(callback);
	});
}

wifi.enableAP = function(callback) {
	var enableAP = function() {
		wifi.disconnect();
		wifi.stop();
		iw.disable(function(){
			wifi.apMode = true;
			var channel = (wifi.connected && wifi.connected.channel) ? wifi.connected.channel : 6;
			var ssid = 'TL+VIEW';
			hostApdConfig(ssid, channel, function(){
				exec(ENABLE_AP, function(err) {
					if(callback) callback(err);
				});
			});
		});
	}
	if(wifi.apMode) {
		wifi.disableAP(function(){
			enableAP();
		});
	} else {
		if(dualInterface) {
			enableAP();
		} else {
			wifi.disconnect(function(){
				wifi.powerCycle(function(){
					enableAP();
				});
			})
		}
	}
}

wifi.disableAP = function(callback) {
	wifi.apMode = false;
	//wifi.connected = false;
	exec(DISABLE_AP, function(err) {
		wifi.enable(callback);
	});
}

module.exports = wifi;
