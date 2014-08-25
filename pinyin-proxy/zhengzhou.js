var http = require('http');
var https = require('https');
var fs = require('fs');
var pinyin = require('pinyin');
var _ = require('underscore');
var zlib = require('zlib');
var url = require('url');
process.on('uncaughtException', function (err) {
	// console.log(err);
});
var elem = [['ā', 'ē', 'ī', 'ō', 'ū', 'ǖ'], ['á', 'é', 'í', 'ó', 'ú', 'ǘ'], ['ǎ', 'ě', 'ǐ', 'ǒ', 'ǔ', 'ǚ'], ['à', 'è', 'ì', 'ò', 'ù', 'ǜ']];
var chv = [1, 3, 0, 2];
function zhengzhouize (str) {
	var ch = {};
	for (var i = 0; i < 4; i++)
		for (var j = 0; j < 6; j++)
			ch[elem[i][j]] = elem[chv[i]][j];
	var res = [];
	for (var i = 0; i < str.length; i++) {
		var t = str.charAt(i);
		res.push(ch[t] || t);
	}
	return res.join('');
};
http.createServer(function(request, response) {
	request.headers['connection'] = request.headers['proxy-connection'];
	delete request.headers['proxy-connection'];
	var parsedUrl = url.parse(request.url);
	// console.log(parsedUrl);
	var proxy = http.createClient(parsedUrl.port, parsedUrl.hostname);
	var proxy_request = proxy.request(request.method, parsedUrl.path, request.headers);
	// console.log(request.method + ' ' + parsedUrl.path);
	// console.log(request.headers);
	proxy_request.addListener('response', function (proxy_response) {
		var buffers = [];
		var len = 0;
		// console.log(proxy_response.headers);
		var contentEn = proxy_response.headers['content-encoding'];
		delete proxy_response.headers['content-encoding'];
		proxy_response.addListener('data', function(chunk) {
			buffers.push(chunk);
			len += chunk.length;
		});
		proxy_response.addListener('end', function() {
			var bufferRaw = Buffer.concat(buffers, len);
			var work = function (buffer) {
				var bufferString = buffer.toString('utf8');
				var utf8_reg = /^text\/html;\s*charset=UTF-8$/i;
				var utf8_meta_reg = /<meta.*content="text\/html;\s*charset=utf-8".*>/i;
				if (utf8_reg.test(proxy_response.headers['content-type']) || utf8_meta_reg.test(bufferString)) {
					var f_pinyin = function (str) {
						return _.map(str.split('\n'), function(s) {
							return _.map(s.split(' '), function(s) {
								return _.map(_.flatten(pinyin(s)), zhengzhouize).join(' ');
							}).join(' ');
						}).join('\n');
					};
					/* var t_pinyin = bufferString.replace(/<title>.*<\/title>/i, f_pinyin);
					var bidx = t_pinyin.indexOf('<body');
					t_pinyin = t_pinyin.substring(0, bidx) + f_pinyin(t_pinyin.substring(bidx)); */
					var t_pinyin = f_pinyin(bufferString);
					if (typeof proxy_response.headers['content-length'] != 'undefined') {
						proxy_response.headers['content-length'] = (new Buffer(t_pinyin, 'utf8')).length;
					}
					response.writeHead(proxy_response.statusCode, proxy_response.headers);
					response.write(t_pinyin, 'utf8');
				}
				else {
					if (typeof proxy_response.headers['content-length'] != 'undefined') {
						proxy_response.headers['content-length'] = buffer.length;
					}
					response.writeHead(proxy_response.statusCode, proxy_response.headers);
					response.write(buffer, 'binary');
				}
				response.end();
			}
			if (contentEn == 'gzip') {
				zlib.unzip(bufferRaw, function(err, buffer) {
					if (!err) {
						work(buffer);
					}
					else {
						response.writeHead(proxy_response.statusCode, proxy_response.headers);
						response.write(bufferRaw, 'binary');
					}
				});
			}
			else if (contentEn == 'deflate') {
				zlib.inflateRaw(bufferRaw, function(err, buffer) {
					if (!err) {
						work(buffer);
					}
					else {
						response.writeHead(proxy_response.statusCode, proxy_response.headers);
						response.write(bufferRaw, 'binary');
					}
				});
			}
			else if (!contentEn) work(bufferRaw);
			else {
				response.writeHead(proxy_response.statusCode, proxy_response.headers);
				response.write(bufferRaw, 'binary');
			}
		});
	});
	request.addListener('data', function(chunk) {
		proxy_request.write(chunk, 'binary');
	});
	request.addListener('end', function() {
		proxy_request.end();
	});
}).listen(2413);
// console.log("Proxy start to listen port 2413 (HTTP).");
