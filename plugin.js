
var gutil = require('gulp-util'),
    PluginError = gutil.PluginError,
    async = require('async'),
    jetpack = require('fs-jetpack'),
    path = require('path'),
    util = require('util'),
    fse = require('fs-extra'),
    replace = require('replace');

var PLUGIN_NAME = 'gulp-electron-builder';

function optionDefaults (options, callback) {

    options.private = {};

    // setup the platform
    options.platform = options.platform || process.platform;

    // setup the platform
    options.arch = options.arch || process.arch;

    options.private = {};

    // setup the platform
    options.platform = options.platform || process.platform;

    // setup the arch
    options.arch = options.arch || process.arch;

    /* ******
        check we're on the right platform, before we go any further
    ****** */

    if (['darwin','linux','win32'].indexOf(options.platform) < 0) {
        return cb(new Error('Only darwin, linux or win32 platforms are supported'));
    }

    if (options.platform === 'darwin' && options.arch !== 'x64') {
        return cb(new Error('Only the x64 architecture is supported on the darwin platform.'));
    }

    if (['x64','ia32'].indexOf(options.arch) < 0) {
        return cb(new Error('Only the x64 and ia32 architectures are supported on the ' + process.platform + ' platform.'));
    }

    /* ******
        okay, let's continue
    ****** */

    // setup the src directory
    options.srcDir = options.srcDir || './build/dev';

    // setup the build directory
    options.buildDir = options.buildDir || './build/staging';

    // setup the binaries dir
    options.binariesDir = options.binariesDir || './electron/binaries';

    // setup the full path to the src dir
    options.private.srcDir = path.resolve(options.srcDir);

    // setup the full path to the build dir
    options.private.buildDir = path.resolve(options.buildDir);

    // setup the full path to the binaries dir
    options.private.binariesDir = path.resolve(path.join(options.binariesDir, options.platform));

    // setup the full path to the resources dir
    options.private.resourcesDir = path.resolve((options.platform === 'darwin') ?
        path.join(options.private.buildDir, 'Electron.app', 'Contents', 'Resources') :
        path.join(options.private.buildDir, 'resources'));

    // setup the plist reference
    options.private.plist = path.resolve(options.private.resourcesDir, '..', 'Info.plist');

    // setup the executable reference
    switch (options.platform) {

        case 'darwin':
            options.private.executable = path.resolve(path.join(options.private.buildDir, 'Electron.app', 'Contents', 'MacOS', 'Electron'))
            break;

        case 'linux':
            options.private.executable = path.resolve(path.join(options.private.buildDir, 'electron'));
            break;

        case 'win32':
            options.private.executable = path.resolve(path.join(options.private.buildDir, 'electron.exe'));
            break;

    }

    return callback(null, options);

}

module.exports = function (options, callback) {

    // accept only one argument, as the callback
    if (arguments.length === 1) {
        callback = options;
        options = undefined;
    }

    options = options || {};

    async.series([

        function (cb) {

            // setup the default options
            optionDefaults(options, function (err, opts) {

                if (err) {
                    return cb(err);
                }

                options = opts;

                return cb(null);

            });

        },

        // make sure the binaries are available, error if not
        function (cb) {

            jetpack.existsAsync(options.private.binariesDir)
            .then(function (result) {

                if (result !== 'dir') {
                    return cb(new Error('The binariesDir defined did not exist, please ensure they are available.'));
                }

                return cb(null);

            });

        },

        // make sure the src directory exists, error if not
        function (cb) {

            jetpack.existsAsync(options.private.srcDir)
            .then(function (result) {

                if (result !== 'dir') {
                    return cb(new Error('The srcDir defined did not exist, please ensure it does and contains the source files for your application.'));
                }

                return cb(null);

            });

        },

        // make sure the build directory exists, create if not
        function (cb) {

            jetpack.dirAsync(options.private.buildDir, {
                empty: true
            })
            .then(function () {
                return cb(null);
            });

        },

        // let's copy across the binaries
        function (cb) {

            jetpack.copyAsync(options.private.binariesDir, options.private.buildDir, {
                overwrite: true
            })
            .then(function () {
                return cb(null);
            });

        },

        // let's clear out the resources dir
        function (cb) {

            fse.remove(path.join(options.private.resourcesDir, 'default_app'), cb);

        },

        // let's ensure the destination folder exists
        function (cb) {

            // define the destination folder, for the actual platform
            options.private.appDir = path.resolve((options.platform === 'darwin') ?
                path.join(options.private.resourcesDir, 'app') :
                path.join(options.private.resourcesDir, 'app'));

            fse.ensureDir(options.private.appDir, cb);

        },

        // let's copy everything across to the desination directory
        function (cb) {

            fse.copy(options.private.srcDir, options.private.appDir, cb);

        },

        // let's rename our application
        function (cb) {

            if (!options.name) {
                return cb(null);
            }

            if (options.platform === 'darwin') {

                // replace the application name in the plist
                replace({
                    regex: /\bElectron\b/g,
                    replacement: options.name,
                    paths: [ options.private.plist ]
                });

                // replace the bundle identifier
                replace({
                    regex: 'com\.github\.electron',
                    replacement: options.platformResources[options.platform]['bundleIdentifier'],
                    paths: [ options.private.plist ]
                })
            }

            // now rename the actual binary
            options.private.newExecutable = path.resolve(options.private.executable, '..', options.name);

            if (options.platform === 'win32') {
                options.private.newExecutable += '.exe';
            }

            fse.move(options.private.executable, options.private.newExecutable, cb);

        },

        // let's copy across the icons, if we have them
        function (cb) {

            if (!options.platformResources || !options.platformResources[options.platform] || !options.platformResources[options.platform]['icon']) {
                return cb(null);
            }

            // setup the icon file name
            options.private.platformResources = {};
            options.private.platformResources[options.platform] = {};
            options.private.platformResources[options.platform]['iconFilename'] = path.basename(options.platformResources[options.platform]['icon']);

            fse.copy(options.platformResources[options.platform]['icon'], path.join(options.private.resourcesDir, options.private.platformResources[options.platform]['iconFilename']), cb);

        },

        // if we have custom icon, delete the original and replace the name
        function (cb) {

            if (!options.private || !options.private.platformResources || !options.private.platformResources[options.platform]) {
                return cb(null);
            }

            fse.remove(path.join(options.private.resourcesDir, 'atom.icns'), function (err) {

                if (err) {
                    return cb(err);
                }

                replace({
                    regex: 'atom\.icns',
                    replacement: options.private.platformResources[options.platform]['iconFilename'],
                    paths: [ options.private.plist ]
                });

                return cb(null);

            })

        },

        // if we're on mac, finally, rename the .app file
        function (cb) {

            if (options.platform !== 'darwin') {
                return cb(null);
            }

            fse.move(path.join(options.private.buildDir, 'Electron.app'), path.join(options.private.buildDir, options.name + '.app'), cb);

        }

    ], function (err) {

        if (err) {
            return callback(new PluginError(PLUGIN_NAME, err.message));
        }

        return callback(null);

    });

}
