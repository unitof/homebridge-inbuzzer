// var Accessory, Service, Characteristic, UUIDGen, Types;

const gpio = require('onoff').Gpio;

module.exports = function(homebridge) {
  console.log("homebridge API version: " + homebridge.version)

  // Accessory must be created from PlatformAccessory Constructor
  Accessory = homebridge.platformAccessory;

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;
  Types = homebridge.hapLegacyTypes;

  homebridge.registerAccessory('homebridge-inbuzzer', 'DoorBuzzer', DoorBuzzer);
}

function DoorBuzzer(log, config) {
  this.services = [];
  
  if(!config.name) throw new Error("'name' parameter is missing for accessory " + config.type);
  if(!config.pin && !config.pins) throw new Error("'pin(s)' parameter is missing for accessory " + config.name);
  
  var infoService = new Service.AccessoryInformation();
  infoService.setCharacteristic(Characteristic.Manufacturer, 'Jacob Ford')
  infoService.setCharacteristic(Characteristic.Model, config.type)
  //infoService.setCharacteristic(Characteristic.SerialNumber, 'Raspberry');
  this.services.push(infoService)
  
  this.device = new LockMechanism(this, log, config)
}

// TODO: really, should these both just be combined with below?

DoorBuzzer.prototype = {
  getServices: function() {
    return this.services;
  },
  
  addService: function(service) {
    this.services.push(service);
  }
}

function LockMechanism(accessory, log, config) {
  this.log = log;
  this.pin = config.pin;
  this.inverted = config.inverted || false;
  this.duration = config.duration || false;

  if (gpio && gpio.accessible) {
    this.gpio = new gpio(this.pin, 'out')
  } else {
    console.warn('GPIO not accessible. (You sure this is a Pi?)')
    console.log('Will simulate locking/unlocking in console.')
    this.gpio = {
      writeSync: function (value) {
        console.log('virtual lock now has value: ' + value);
      }
    };
  }

  this.gpio.writeSync(this.inverted ? 1 : 0) // lock
  
  this.service = new Service.LockMechanism(config.name);
  this.target = this.service.getCharacteristic(Characteristic.LockTargetState)
    .on('set', this.setLockState.bind(this))
    .updateValue(Characteristic.LockTargetState.SECURED);
  this.state = this.service.getCharacteristic(Characteristic.LockCurrentState)
    .on('get', this.getLockState.bind(this))
    .updateValue(Characteristic.LockCurrentState.SECURED);
  
  accessory.addService(this.service);
}

LockMechanism.prototype = {
  setLockState: function(value, callback) {
    var that = this;
    var OPEN = this.inverted ? 0 : 1;
    var CLOSE = this.inverted ? 1 : 0;
    
    if(value == Characteristic.LockTargetState.UNSECURED) {
      that.gpio.writeSync(OPEN)
      this.state.updateValue(Characteristic.LockCurrentState.UNSECURED);
      callback();
      if(this.duration) {
        setTimeout(function(){
          that.gpio.writeSync(CLOSE)
          that.target.updateValue(Characteristic.LockTargetState.SECURED);
          that.state.updateValue(Characteristic.LockCurrentState.SECURED);
        }, this.duration * 1000);
      }
    } else {
      that.gpio.writeSync(OPEN)
      this.state.updateValue(Characteristic.LockCurrentState.SECURED);
      callback();
    }
  },
  
  getLockState: function(callback) {
    var state = this.gpio.readState();
    if(this.inverted)
      state = !state;
    callback(null, state ? Characteristic.LockCurrentState.UNSECURED : Characteristic.LockCurrentState.SECURED);
  }
}