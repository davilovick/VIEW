var Wireless = require('wireless');
var exec = require("child_process").exec;
var fs = require('fs');
var EventEmitter = require("events").EventEmitter;

var wifi = new EventEmitter();

var ENABLE_AP = "/bin/sh /home/view/current/bin/enable_ap.sh";
var DISABLE_AP = "/bin/sh /home/view/current/bin/disable_ap.sh";
var WIFI_SHUTDOWN = "sudo modprobe -r 8723bu";
var WIFI_POWERON = "sudo modprobe 8723bu";

var iw = new Wireless({ iface:'wlan0', updateFrequency: 60, connectionSpyFrequency: 10 });

var hostapdConfig = "# Autogenerated by wifi.js\n\ninterface=wlan0\n\
ctrl_interface=/var/run/hostapd\n\
ssid=TL+VIEW\n\
#wpa=2\n\
#wpa_psk=c1381810ba811147915d9f158d6254eb868808576ac550274cefe5bb776e5216\n\
country_code=US\n\
channel=6\n\
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

fs.writeFileSync(HOSTAPD_CONFIG_PATH, hostapdConfig);

function updateExportedList() {
	wifi.list = [];
	for(var i in list) {
		wifi.list.push(list[i]);
	}
}

iw.on('appear', function(network) {
	console.log("[Wifi] Appear:", network);
	list[network.address] = network;
	updateExportedList();
	if(listCallback) listCallback(wifi.list);
});

iw.on('change', function(network) {
	console.log("[Wifi] Change:", network);
	list[network.address] = network;
	updateExportedList();
});

iw.on('signal', function(network) {
	console.log("[Wifi] Signal:", network);
	list[network.address] = network;
	updateExportedList();
});

iw.on('vanish', function(network) {
	console.log("[Wifi] Vanish:", network);
	delete list[network.address];
	updateExportedList();
	if(listCallback) listCallback(wifi.list);
});

iw.on('error', function(err) {
	console.log("[Wifi] Error:", err);
});

iw.on('empty', function() {
	console.log("[Wifi] Empty");
	list = {};
	wifi.list = [];
	if(listCallback) listCallback(wifi.list);
});

iw.on('join', function(data) {
	console.log("[Wifi] Join:", data);
	if(!wifi.apMode) {
		wifi.connected = data;
		wifi.emit("connect", data.ssid);
	}
});

iw.on('former', function(address) {
	console.log("[Wifi] Former:", address);
	if(!wifi.apMode) wifi.connected = address;
});

iw.on('leave', function() {
	console.log("[Wifi] Leave");
	wifi.emit("disconnect");
	var reconnect = false;
	if(wifi.connected) {
		reconnect = {};
		for(var key in wifi.connected) {
			if(wifi.connected.hasOwnProperty[key]) reconnect[key] = wifi.connected[key];
		}
	}
	wifi.connected = false;
	if(reconnect && reconnect.address) wifi.connect(reconnect);
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

wifi.enable = function(cb) {
	exec(WIFI_POWERON, function(err) {
		iw.enable(function(err) {
			if(!err) {
				exec("iw wlan0 set power_save off", function(err) {
					wifi.enabled = true;
					wifi.scan();
				});
			} else {
				console.log("Error Enabling WiFi:", err);
			}
			if(cb) cb(err);
		});
	});
}

wifi.disable = function(callback) {
	var disable = function() {
		wifi.disconnect();
		wifi.stop();
		iw.disable(function(){
			wifi.enabled = false;
			exec(WIFI_SHUTDOWN, function(err) {
				if(callback) callback(err);
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
			iw.dhcp(function(ipaddress){
				console.log("[Wifi] Ip Address:", ipaddress);
				//wifi.connected = network.address;
				if(callback) callback();
			});
		});
	};
	if(wifi.apMode) {
		wifi.disableAP(join);		
	} else {
		wifi.disconnect(join);
	}
}

wifi.disconnect = function(callback) {
	wifi.connected = false;
	iw.dhcpStop(function(){
		console.log("[Wifi] Stopped DHCP, leaving wifi network...")
		iw.leave(callback);
	});
}

wifi.enableAP = function(callback) {
	wifi.connected = false;
	wifi.apMode = true;
	var enableAP = function() {
		exec(ENABLE_AP, function(err) {
			if(callback) callback(err);
		});
	}
	if(wifi.connected) {
		wifi.disconnect(enableAP);
	} else {
		enableAP();
	}

}

wifi.disableAP = function(callback) {
	wifi.apMode = false;
	wifi.connected = false;
	exec(DISABLE_AP, function(err) {
		if(callback) callback(err);
	});
}

module.exports = wifi;
