// ==UserScript==
// @name         12306 车次座位查看
// @name:zh-CN   12306 车次座位查看
// @author       ChangJin Wei (魏昌进)
// @website      https://wcj.plus/
// @namespace    https://github.com/galaxy-sea/12306-seat-viewer
// @version      __VERSION__
// @description  12306 车次座位查看让你避免乘坐二手句的老动车，让你避免花动车的钱乘坐到绿皮的体验
// @description:zh-CN 12306 车次座位查看让你避免乘坐二手句的老动车，让你避免花动车的钱乘坐到绿皮的体验
// @license      Apache-2.0
// @homepageURL  https://github.com/galaxy-sea/12306-seat-viewer
// @supportURL   https://github.com/galaxy-sea/12306-seat-viewer/issues
// @icon         https://raw.githubusercontent.com/galaxy-sea/12306-seat-viewer/main/icons/icon16.png
// @downloadURL  https://raw.githubusercontent.com/galaxy-sea/12306-seat-viewer/main/userscripts/12306-seat-viewer.user.js
// @updateURL    https://raw.githubusercontent.com/galaxy-sea/12306-seat-viewer/main/userscripts/12306-seat-viewer.user.js
// @match        https://kyfw.12306.cn/otn/leftTicket/init*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

GM_addStyle(__CONTENT_CSS_STRING__);

__CONTENT_SCRIPT__
