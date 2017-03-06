// var Imagemin = require('imagemin');
let fs = require('fs');
let path = require('path');
let minimatch = require('minimatch');
let cheerio = require('cheerio');
let sizeOf = require('image-size');

// Defaults
let options = {};
let filename = false;
let parent = options.parent || 'body';
let ignore = options.ignore || false;
let ignoreSelectors = options.ignoreSelectors || false;
let defaultWidth  = options.defaultWidth || 100;
let widths    = options.widths || [100, 480, 768, 992, 1200];
let qualities = options.qualities || [20, 40, 70, 70, 70];
let includeImages = options.includeImages || true;
let backgrounds = options.backgrounds || false;
let queryString = options.querystring || false;
let queryStrings = getQuerystrings();
let placeholder = options.placeholder || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

// export default function plugin(options) {
module.exports = function plugin(options) {

  options = options || {};

	// main function
  return function (files, metalsmith, done){
    // console.log(Object.keys(files));
    let rootFolder = `${metalsmith._directory}/${metalsmith._source}`;
    // console.log('ROOTFOLDER: ', rootFolder);

    Object.keys(files)
		.filter(minimatch.filter('**/*.@(htm|html)'))
    .forEach((file) => {
      let $ = cheerio.load(files[file].contents);
      addMarkup($, backgrounds, file, files, rootFolder);
      let newContents = new Buffer($.html());
      files[file].contents = newContents;
    });

    done();
  }
}

const addMarkup = function ($, backgrounds, file, files, rootFolder){
  let selectors = backgrounds || [];

  if (includeImages) {
    selectors = ['img'].concat(selectors);
  }

  let imgPath;
  if (files[file]._originalPath) {
    imgPath = `${files[file]._originalPath.split(/\//).splice(0, files[file]._originalPath.split(/\//).length - 1).join('/') }/`;
  } else {
    imgPath = `${file.split(/\//).splice(0, file.split(/\//).length - 1).join('/') }/`;
  }
  // console.log('IMGPATH: ', imgPath);

  selectors = typeof selectors === 'string' ? [selectors] : selectors;
  // background = background || false;
  selectors.forEach((selector) => {
    $.root().find(selector).each(function(){
      let isImage = selector === 'img';
      let isBackground = !isImage;

      let el = $(this);
      let src = isImage ? el.attr('src') : el.css('background-image')
      if(src){
        if(ignore && minimatch(src, ignore)) return;
        if(ignoreSelectors && el.parents(ignoreSelectors).length > 0) {
          return;
        }

        if (isBackground) {
          src = src.match(/(?:^url\(["|']?)([^'"]*)(?:["|']?\))$/)[1]
        }

        let urls;
        if (queryStrings) {
          urls = getURLsFromQuerystring(src);
        } else {
          urls = generateURLs(src);
        }

        el.attr('data-sizes', 'auto');
        el.addClass('lazyload');

        if(isImage){
          el.attr('src', placeholder);
          el.attr('data-src', urls.widths[defaultWidth]);
          el.attr('data-srcset', urls.srcset.join(', '));

          let cleanPath = src.replace('./', '');
          if (src[0] === '/') {
            cleanPath = `${rootFolder}${src}`;
          } else {
            cleanPath = `${rootFolder}/${imgPath}${src}`;
          }

          // let cleanPath = tempPath.replace('/./', '/');
          // let cleanPath = tempPath;
          // console.log(cleanPath);

          let dimensions;
          try {
            dimensions = sizeOf(cleanPath);
          } catch(err) {
            try {
              let _permalinkedFile = `${src.split(/\//).splice(0, src.split(/\//).length - 1).join('/') }/index.html`;
              _permalinkedFile = _permalinkedFile.slice(1);
              _permalinkedFile = files[_permalinkedFile]._originalPath;
              let _rootPath = `${_permalinkedFile.split(/\//).splice(0, _permalinkedFile.split(/\//).length - 1).join('/') }/`

              let _imgSrc = src.split(/\//).pop();
              dimensions = sizeOf(`${rootFolder}/${_rootPath}${_imgSrc}`);
            } catch(err) {
              console.log(err);
            }
          }

          if (dimensions) {
            el.attr('height', dimensions.height);
            el.attr('width', dimensions.width);
          }
        } else {
          el.css({'background-image': `url(${urls.widths[defaultWidth]})`});
          el.attr('data-bgset', urls.srcset.join(', '));
        }
      }
    })
  });
  return $;
}

function getQuerystrings(){
  if(!queryString) return false;
  let queryStrings = [];
  widths.forEach((width, index) => {
    let query = {};
    Object.keys(queryString).forEach((key) => {
      let val = queryString[key];
      if(val === '%%width%%') val = width;
      if(val === '%%quality%%') val = qualities[index];
      query[key] = val;
    })
    queryStrings.push(query)
  })
  return queryStrings;
}

function generateURLs(src) {
  var src = src.split(/(\.\w+)$/);

  let srcset = [];
  let widthsObj = {};

  widths.forEach((width, index) => {
    srcset.push(`${src[0] + width + src[1] } ${ width }w`);
    widthsObj[width] = src[0] + width + src[1];
  });

  return {srcset: srcset, widths: widthsObj};
}

function getURLsFromQuerystring(src){
  if(!queryStrings) return false;
  var src = src.split('?');
  let srcBase = src[0];

  let existingQueries = src[1];
  let existingQuerystring = {}

  let widthKey = getWidthKey();

  let srcset = [];
  let widths = {};
  if(existingQueries){
    existingQueries = existingQueries.split('&')
    existingQueries.forEach((query) => {
      query = query.split('=');
      existingQuerystring[query[0]] = query[1];
    })
  }

  // get rid of keys we don't want to add back to the query string
  let existingKeys = Object.keys(existingQuerystring)
  for(key in queryStrings[0]){
    var i = existingKeys.indexOf(key);
    if(i>-1){
      existingKeys.splice(i, 1)
    }
  }


  for (var i = 0, l=queryStrings.length; i < l; i++) {
    var queryString = queryStrings[i];
    // see if the width at the breakpoint we're looking for is larger than the existing width
    if(existingQuerystring && existingQuerystring[widthKey] && existingQuerystring[widthKey] < queryString[widthKey]){
      break;
    }
    var newQueryString = [];
    Object.keys(queryString).forEach((key) => {
      newQueryString.push(`${key }=${ queryString[key]}`)
    })
    existingKeys.forEach((key) => {
      newQueryString.push(`${key }=${ existingQuerystring[key]}`)
    })
    let url = `${srcBase }?${ newQueryString.join('&')}`
    widths[queryString[widthKey]] = url;
    srcset.push(`${url } ${ queryString[widthKey] }w`);
  }
  return {srcset: srcset, widths: widths};
}

function getWidthKey(){
  if(!queryString) return false;
  let widthKey = false;
  for (key in queryString) {
    if(queryString[key] === '%%width%%') {
      widthKey = key;
      break;
    }
  }
  return widthKey;
}
