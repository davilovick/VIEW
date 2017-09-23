require('rootpath')();

var DCRAW = "dcraw";
var execFile = require('child_process').execFile;
var epeg = require('epeg');
var sharp = require('sharp');
var fs = require('fs');
var luminance = require('jpeg-lum');
var jpegSize = require('jpeg-size');

var filesystem = require('system/filesystem.js');
var TMPFOLDER = filesystem.tmpViewPath;

var log2 = Math.log2 || function(x) {
    return Math.log(x) / Math.LN2;
};

var TMP_IMAGE_INPUT = TMPFOLDER + "/tmp_image_in";
var TMP_IMAGE_OUTPUT = TMPFOLDER + "/tmp_image_in.thumb.jpg";
var TMP_IMAGE_THUMB = TMPFOLDER + "/tmp_image_thm.jpg";

function getJpeg(path, crop, callback) {
    console.log("Processing photo...");
    try {
        console.log("Fetching JPEG from RAW photo...", path);
        var dcraw = execFile(DCRAW, ['-e', path], function(err, stdout, stderr) {
            if (err) console.log("DCRAW Error:", err);
            if (stderr) console.log("StdErr:", stderr);
            var size = {
                x: 840,
                q: 75
            };
            console.log("Downsizing JPEG...");
            if (path == TMP_IMAGE_INPUT || path.indexOf('.') === -1) path += ".X"; // this gets replaced
            var thmFile = path.replace(/\.([a-z0-9])+$/i, ".thumb.jpg");
            exports.downsizeJpeg(thmFile, size, crop, function(err2, thm) {
                fs.unlink(thmFile);
                if (!err && err2) err = err2;
                if (callback) callback(err, thm);
            });
        });
    } catch (e) {
        console.log("(getJpeg) ERROR: ", e);
        if (callback) callback(e);
    }
}

exports.writeXMP = function(fileName, exposureCompensation, description, name, lat, lon) {
    var template = '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 5.5-c002 1.148022, 2012/07/15-18:06:45        ">\n\
 <rdf:RDF xmlns:rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#" >\n\
  <rdf:Description rdf:about=""\n\
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"\n\
    xmlns:tiff="http://ns.adobe.com/tiff/1.0/"\n\
    xmlns:exif="http://ns.adobe.com/exif/1.0/"\n\
    xmlns:dc="http://purl.org/dc/elements/1.1/"\n\
    xmlns:aux="http://ns.adobe.com/exif/1.0/aux/"\n\
    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"\n\
    xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"\n\
    xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#"\n\
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"\n\
    crs:Exposure2012="{{EXP}}">\n\
    <dc:subject>\n\
     <rdf:Bag>\n\
      <rdf:li>Timelapse+ VIEW</rdf:li>\n\
      <rdf:li>time-lapse</rdf:li>\n\
      <rdf:li>{{NAME}}</rdf:li>\n\
     </rdf:Bag>\n\
    </dc:subject>\n\
    <dc:description>\n\
     <rdf:Alt>\n\
      <rdf:li xml:lang="x-default">{{DESC}}</rdf:li>\n\
     </rdf:Alt>\n\
    </dc:description>\n\
  </rdf:Description>\n\
{{GPS}}  <rdf:Description rdf:about=""\n\
    xmlns:lrt="http://lrtimelapse.com/">\n\
    <lrt:ExternalExposureDefault>{{LRTEXP}}</lrt:ExternalExposureDefault>\n\
  </rdf:Description>\n\
  </rdf:RDF>\n\
</x:xmpmeta>';
    
    var gpsData = "";
    if(lat != null && lat != null) {
        if(lat < 0) {
            lat = 0 - lat;
            lat = "S" + lat.toString();
        } else {
            lat = "N" + lat.toString();
        }
        if(lon < 0) {
            lon = 0 - lon;
            lon = "W" + lon.toString();
        } else {
            lon = "E" + lon.toString();
        }
        var gpsData = '  <rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/">\n\
            <exif:GPSLatitude>{{LAT}}</exif:GPSLatitude>\n\
            <exif:GPSLongitude>{{LON}}</exif:GPSLongitude>\n\
          </rdf:Description>\n\
        ';
        gpsData = gpsData.replace("{{LAT}}", lat);
        gpsData = gpsData.replace("{{LON}}", lon);
    }

    var expString = (exposureCompensation >= 0 ? "+" : "") + exposureCompensation.toString();
    var xmpData = template.replace("{{EXP}}", expString);
    xmpData = xmpData.replace("{{LRTEXP}}", expString);
    xmpData = xmpData.replace("{{NAME}}", name);
    xmpData = xmpData.replace("{{DESC}}", description);
    xmpData = xmpData.replace("{{GPS}}", gpsData);

    console.log("writing XMP file");
    fs.writeFileSync(fileName.replace(/\.[0-9a-z]+$/i, '.xmp'), xmpData);
}

exports.saveTemp = function(name, buf, callback) {
    var file = name ? TMPFOLDER + "/" + name : TMP_IMAGE_INPUT;
    fs.writeFile(file, new Buffer(buf), function(err) {
        if (callback) callback(err, file);
    });
}

exports.getJpegFromRawFile = function(rawImagePath, crop, callback) {
    getJpeg(rawImagePath, crop, callback);
}

exports.downsizeJpeg = function(jpeg, size, crop, callback) {
    //console.log("Resizing photo...");
    if (!size) size = {};
    if (!size.x) x = (size.y > 0) ? size.y * 1.5 : 300;
    if (!size.y) size.y = Math.round(size.x / 1.5);
    if (!size.q) size.q = 70;

    if (!jpeg) return;

    var jpegConfig = {};
    if (typeof jpeg == "string") {
        //console.log("downsizeJpeg: reading image file", jpeg);
        jpegBuf = fs.readFileSync(jpeg);
    } else {
        //console.log("downsizeJpeg: assuming image buffer");
        jpegBuf = jpeg;
    }

    var err = null;
    try {
        var img = new epeg.Image({
            data: jpegBuf
        });
        var thm;
        if (crop && crop.xPercent && crop.yPercent) {
            imgSize = jpegSize(jpegBuf);
            if (imgSize) {
                if (crop.xPercent > 1) crop.xPercent /= 100;
                if (crop.yPercent > 1) crop.yPercent /= 100;
                crop.x = Math.round(imgSize.width * crop.xPercent - size.x / 2);
                crop.y = Math.round(imgSize.height * crop.yPercent - size.y / 2);
                if (crop.x < 0) crop.x = 0;
                if (crop.y < 0) crop.y = 0;
                if (crop.x > imgSize.width - size.x) crop.x = imgSize.width - size.x;
                if (crop.y > imgSize.height - size.y) crop.y = imgSize.height - size.y;
                //console.log("cropping to ", crop, size);
                thm = img.crop(crop.x, crop.y, size.x, size.y, size.q).process();
            } else {
                console.log("failed to read image size; not cropping");
                thm = img.downsize(size.x, size.y, size.q).process();
            }
        } else {        
            imgSize = jpegSize(jpegBuf);   
            if(imgSize)
            {
                if(imgSize.width > size.x || imgSize.height > size.y){
                    thm = img.downsize(size.x, size.y, size.q).process();
                }
                else{
                    thm = jpegBuf;
                }
            }
            else{
                thm = img.downsize(size.x, size.y, size.q).process();
            }            
        }
        //console.log("downsizeJpeg: Done.");
    } catch (e) {
        console.log("Error resizing photo", e);
        err = e;
    }
    delete img;
    if (callback) callback(err, thm);
}

exports.downsizeJpegSharp = function(jpeg, size, crop, exposureCompensation, callback) {
    return exports.downsizeJpeg(jpeg, size, crop, callback);
    


    console.log("(sharp) Resizing photo...");
    var startTime = new Date() / 1000;
    if (!size) size = {};
    if (!size.x) x = (size.y > 0) ? size.y * 1.5 : 300;
    if (!size.y) size.y = size.x / 1.5;
    if (!size.q) size.q = 70;
    if (!jpeg) return;

    var jpegConfig = {};
    if (typeof jpeg == "string") {
        jpegBuf = fs.readFileSync(jpeg);
    } else {
        jpegBuf = jpeg;
    }

    var err = null;
    try {
        var img = sharp(jpegBuf);
        //var img = new epeg.Image({
        //    data: jpegBuf
        //});
        var thm;
        var cb = function(err) {
            var processingTime = (new Date() / 1000) - startTime;
            console.log("(sharp) Done resizing photo in ", processingTime, "seconds");
            callback && callback(err);
        }
        if (crop && crop.xPercent && crop.yPercent) {
            img.metadata(function(err, metadata) {
                if (!err && metadata) {
                    if (crop.xPercent > 1) crop.xPercent /= 100;
                    if (crop.yPercent > 1) crop.yPercent /= 100;
                    crop.x = metadata.width * crop.xPercent - size.x / 5;
                    crop.y = metadata.height * crop.yPercent - size.y / 5;
                    if (crop.x < 0) crop.x = 0;
                    if (crop.y < 0) crop.y = 0;
                    if (crop.x > metadata.width - size.x) crop.x = metadata.width - size.x;
                    if (crop.y > metadata.height - size.y) crop.y = metadata.height - size.y;
                    console.log("cropping to ", crop);
                    img.extract({
                        left: Math.round(crop.x),
                        top: Math.round(crop.y),
                        width: Math.round(size.x),
                        height: Math.round(size.y)
                    }).sharpen().jpeg().quality(size.q).toBuffer(cb);
                } else {
                    console.log("failed to read image size; not cropping");
                    img.resize(Math.round(size.x), Math.round(size.y)).sharpen().jpeg().quality(size.q).toBuffer(cb);
                }
            });
        } else {
            if (exposureCompensation) {
                img.resize(Math.round(size.x), Math.round(size.y)).raw().toBuffer(function(err, buf, info) {
                    if (!err && buf) {
                        console.log("adding exposure compensation of " + exposureCompensation);
                        for (var i = 0; i < buf.length; i++) {
                            // read 8-bit pixel val from buf
                            var val = buf.readUInt8(i, true);
                            if (val < 255) {
                                // convert to linear
                                val = Math.pow(val / 255, 2.2) * 255;
                                // add exposure compensation
                                val *= Math.pow(2, exposureCompensation);
                                // reapply gamma
                                val = Math.pow(val / 255, 1 / 2.2) * 255;
                                // coerce to 8-bit range
                                val = Math.round(Math.min(Math.max(val, 0), 255));
                                // save to buf
                            }
                            buf.writeUInt8(val, i, true);
                        }
                        console.log("exposure compensation done");
                        var out = sharp(buf, {
                            raw: info
                        }).gamma(2.2).sharpen().jpeg().quality(size.q).toBuffer(cb);
                    } else {
                        console.log("Error creating buffer", err);
                        if (callback) callback(err, null);
                    }
                });
            } else {
                img.resize(Math.round(size.x), Math.round(size.y)).sharpen().jpeg().quality(size.q).toBuffer(cb);
            }
        }
        console.log("Done.");
    } catch (e) {
        console.log("Error resizing photo", e);
        err = e;
        if (callback) callback(err, null);
    }
}

exports.getJpegBuffer = function(jpegPath, callback) {
    console.log("Loading JPEG as buffer...");
    var err = null;
    try {
        fs.readFile(jpegPath, function(err, jpg) {
            if (callback) callback(err, jpg);
        });
        console.log("Done.");
    } catch (e) {
        console.log("Error loading photo (" + jpegPath + ")", e);
        err = e;
        if (callback) callback(err, null);
    }
}

exports.exposureValue = function(jpegBuffer, callback) {
    var highlightProtection = 20;

    fs.writeFile(TMP_IMAGE_THUMB, jpegBuffer, function() {
        luminance.read(TMP_IMAGE_THUMB, function(err, res) {
            var lum = 0;
            if(!err && res && res.luminance) {
                lum = res.luminance;
                if(res.clipped && highlightProtection) {
                    console.log("Compensating for clipped highlights: ", res.clipped * highlightProtection);
                    lum += res.clipped * highlightProtection;
                }
            }
            if (callback) callback(err, lum, res.histogram);
        });
    });
}