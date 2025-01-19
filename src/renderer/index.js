'use strict';

import global from '../assets/js/global.js'
import { AppList } from './app-list.js'
import { version } from '../../../package.json';
import "../assets/libs/bootstrap.5.0.2.1.0.min.css"
import "../assets/libs/editor.ace.css"
import "../assets/scss/app.css"

// app version
global.state.version = { required: version, current: version, latest: version };

// app list
new AppList();
