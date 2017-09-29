/**
 * This represents a lyrics file - a sequence of words with timestamps
 * attached.
 *
 * @param duration The maximum timestamp. This is used to approximate
 *   timestamps if a word is not timed. Can also be set later (e.g.
 *   ondurationchange event).
 * @constructor
 */
Lyrics = function(duration) {
  EventEmitter.apply(this);
  this.duration = duration;
};
Lyrics.prototype = new Array();
$.extend(Lyrics.prototype, EventEmitter.extend());
/**
 * Set the timestamp for the word at the given index.
 *
 * Will validate all timestamp of subsequent words accordingly.
 *
 * Will trigger a "timeChanged" event for every change made.
 *
 * @param index
 * @param time
 */
Lyrics.prototype.setTimeOfWord = function(index, time) {
  var hasChanged = this[index].time != time;
  this[index].time = time;
  if (hasChanged) this.emit('timeChanged', index, time);
  // If the time was actually deleted, we don't need to / mustn't run the
  // validation passes below.
  if (time == null || time == undefined)
    return;
  // Search subsequent words, and remove any timestamps that have
  // become invalid (due to being older than the current word).
  for (var i=index+1; i<this.length; i++) {
    if (this[i].time && this[i].time <= time) {
      this[i].time = null;
      this.emit('timeChanged', i, null);
    }
  }
  // Search earlier words, and validate those as well (remember, the user
  // can easily jump to a later word and set the time to something earlier).
  for (var i=index-1; i>=0; i--) {
    if (this[i].time && this[i].time >= time) {
      this[i].time = null;
      this.emit('timeChanged', i, null);
    }
  }
};
/**
 * Return the word index for the given timestamp.
 *
 * This is done in a way such that when a word is not timed, an implicit
 * timestamp is assumed based on earlier and later words which are timed.
 */
Lyrics.prototype.getIndexForTime = function(timestamp)
{
  // Without a duration, we cannot handle untimed words. Maybe instead
  // of an assert, we could gracefully degrade to support only timed words.
  assert(this.duration, 'No duration set.');
  // Start by assuming that the first word is at 0 seconds
  var earlierTimestamp = 0, earlierIndex = 0;
  for (var i=0; i<this.length; i++)
  {
    var word = this[i];
    var isLastWord = (i==this.length-1);
    // If the last word is not timed, implicitly assume that it is at the
    // end of the audio file.
    var timeOfThisWord = word.time;
    if (!timeOfThisWord && isLastWord)
      timeOfThisWord = this.duration;
    // Find the first word with a timestamp later than the
    // one we are looking for.
    if (isLastWord || (timeOfThisWord && timeOfThisWord >= timestamp)) {
      // Determine the index of ``timestamp`` in between the
      // two timed words.
      var relPosBetweenBounds =
          (timestamp - earlierTimestamp) /
          (timeOfThisWord - earlierTimestamp);
      var index =  earlierIndex + (
        relPosBetweenBounds * (i-earlierIndex));
      return parseInt(index);
    }
    if (word.time) {
      earlierIndex = i;
      earlierTimestamp = word.time;
    }
  }
};
/**
 * For the word the given index, return it's timestamp.
 *
 * If the word has no explicit timestamp set, try to approximate the value
 * based on boundaries from earlier and later words.
 *
 * @param index Index of the word whose timestamp to return.
 */
Lyrics.prototype.getApproximateTime = function(index)
{
  assert(index.constructor === Number, 'index must be a Number');
  // Search for nearest timestamp earlier in text
  var earlierTimestamp = 0, earlierIndex = 0;
  for (var i=index-1; i>=0; i--) {
    if (this[i].time) {
      earlierIndex = i;
      earlierTimestamp = this[i].time;
      break;
    }
  }
  // Search for nearest timestamp later in text
  var laterTimestamp = this.duration, laterIndex = this.length-1;
  for (var i=index+1; i<this.length; i++) {
    if (this[i].time) {
      laterIndex = i;
      laterTimestamp = this[i].time;
      break;
    }
  }
  //console.log('index from '+earlierIndex+' to '+laterIndex);
  //console.log('timestamp from '+earlierTimestamp+' to '+laterTimestamp);
  var relPos = (index-earlierIndex) / (laterIndex-earlierIndex);
  return earlierTimestamp + relPos * (laterTimestamp - earlierTimestamp);
};
/**
 * Export to Enhanced LRC.
 */
Lyrics.prototype.toELRC = function() {
  var result = '';
  var isNewLine = false;
  var isFirstWord = true;
  for (var i=0; i<this.length; i++) {
    var word = this[i];
    var tmpWord = "";
    if (word.text.includes("<br>")) {
      tmpWord = word.text.replace("<br>","");
    }
    else {
      tmpWord = word.text;
    }
    // Start a new line when: This is the first line, OR: is the word after a newline
    if (isNewLine || isFirstWord) {
      result += '\n['+Lyrics.toTimer((word.time || 0))+']';
    }
    else if (word.time) {
      result += ' <'+Lyrics.toTimer(word.time)+'>';
    }
    if (word.text.includes("<br>") && word.time) {
      isNewLine = true;
    }
    else {
      isNewLine = false
    }
    result += ' ' + tmpWord;
    isFirstWord = false;
  }
  return result;
};
/**
 * Persist as JSON. Implements to JSON.stringify() protocol.
 *
 * @return {*}
 */
Lyrics.prototype.toJSON = function() {
  // Do not include the dom element.
  return $.map(this, function(item) {
    return {
      text:item.text, time:item.time};
  }
              )
};
/**
 * Create a new instance based on the given JSON string.
 * @param json
 * @param duration
 * @return {Lyrics}
 */
Lyrics.fromJSON = function(json, duration) {
  var words = JSON.parse(json);
  var lyrics = new Lyrics(duration);
  lyrics.push.apply(lyrics, words);
  return lyrics;
};
/**
 * Creates a new instance based on the given text.
 *
 * @param text Will be splitted at whitespace boundaries.
 * @param duration
 * @return {Lyrics}
 */
Lyrics.fromText = function(text, duration) {
  //add <br> tag to track newline and display newline on gui
  text = text.replace(/ +/g, " ").replace(/　/g,"").replace(/ +\n/g,"\n").trim().replace(/(?:\r\n|\r|\n)/g, '<br>\n');
  var splitted = $.map(text.split(/\s+/g), function(item) {
    // do not add if blank word or line
    if (item && item != "<br>")
      return {
        text: item.trim(), time: duration};
  }
                      );
  var lyrics = new Lyrics(duration);
  lyrics.push.apply(lyrics, splitted);
  return lyrics;
};
/**
 * Creates a new instance based on the given lrc file.
 *
 * @param text Will be splitted at whitespace boundaries.
 * @param duration
 * @return {Lyrics}
 */
Lyrics.fromLRC = function(text, duration) {
  var isElrc = false;
  var offset = 0;
  var tim = [];
  var lyrics = [];
  text = text.replace(/ +/g, " ").replace(/　/g,"").replace(/ +\n/g,"\n").trim().replace(/(?:\r\n|\r|\n)/g, '<br>\n');
  function defined(data) {
  		return data != 'undefined';
  }
  // parsing the Lyrics 
  function processLyrics(allText) {
    
    var hasOffset = (allText.match(/(?:\[offset:)(.*)(?:])/i) != null) ? true : false;
    if(hasOffset) {
      var regex = /(?:\[offset:)(.*)(?:])/g;
      var matches, output = [];
      matches = regex.exec(allText);
      //console.log("Offset: " + matches[1]);
      offset = matches[1] / 1000;
    }
    // This will only divide with respect to new lines 
    allTextLines = allText.split(/\r\n|\n/);
    isElrc = (allTextLines.toString().match(/(?:\<)(\d*)(?::)(\S*?)(?:\>)/i) != null) ? true : false;
    next();
    tim = tim.filter(defined);
    lyrics = lyrics.filter(defined);
    
    if (isElrc) {
      var splitted = [];
      for (var i = 0; i < lyrics.length; i++) {
        var tmparry = $.map(lyrics[i], function(item, index) {
        if (item && item != "<br>") 
          return {text: item.trim(), time: tim[i][index] + offset};
        });
        splitted = splitted.concat(tmparry);
      }
    } else {
      var splitted = [];
      for (var i = 0; i < lyrics.length; i++) {
        var tmparry = $.map(lyrics[i].split(/\s+/g), function(item, index) {
        if (item && item != "<br>") 
          return {text: item.trim(), time: tim[index] + offset};
      });
        splitted = splitted.concat(tmparry);
      }
      
    }
    
    return splitted;
  }
  function next() {
    for (i = 0; i < allTextLines.length; i++) {
      if (allTextLines[i].search(/^(\[)(\d*)(:)(.*)(\])(.*)/i) >= 0) // any line without the prescribed format wont enter this loop 
      {
        line = allTextLines[i].match(/^(\[)(\d*)(:)(.*)(\])(.*)/i);
        var time = (parseInt(line[2]) * 60) + parseFloat(line[4]);
        // will give seconds 
        // if file is a Enhanced format lrc file
        if (isElrc){
          tim[i] = [];
          tim[i][0] = time;
          lyrics[i] = [];
          var tmp = line[6].match(/(?: )(.*?)(?: |$)/i);
          lyrics[i][0] = tmp[0].trim();
          var regex = /(?:\<)(\d*)(?::)(.*?)(?:\>) (.*?)(?: |\n|$)/g;
          //var word = line[6].match(/(?:\<)(\d*)(?::)(.*?)(?:\>) (.*?)(?: |\n|$)/g);
          var matches, output = [];
          for (x = 1; matches = regex.exec(line[6]); x++) {
            //output.push(matches[1]);
            //console.log(matches[1] + matches[2] + matches[3]);
            tim[i][x] = (parseInt(matches[1]) * 60) + parseFloat(matches[2]);
            // will give seconds 
            lyrics[i][x] = matches[3];
          }
          //if proper elrc file, it will have another time tag at the end
          if (line[6].match(/(?:\<)(\d*)(?::)(\S*?)(?:\>\n|\>$)/i)) {
            var last = line[6].match(/(?:\<)(\d*)(?::)(\S*?)(?:\>\n|\>$)/i);
            tim[i][tim[i].length] = (parseInt(last[1]) * 60) + parseFloat(last[2]);
            //console.log(tim[i][tim[i].length - 1]);
          }
        }
        else {
          // file is a normal lrc file
          tim[i] = time;
          lyrics[i] = line[6];
          //will give lyrics 
        }
      }
    }
  }
  
  
  
  var splitted = processLyrics(text);
  
  var lyrics = new Lyrics(duration);
  lyrics.push.apply(lyrics, splitted);
  return lyrics;
};
/**
 * Format a time in seconds in human readable form.
 *
 * From the  Buzz! HTML 5 audio player library.
 *
 * @param time
 * @param withHours
 * @return {String}
 */
Lyrics.toTimer = function(time, withHours) {
  var h, m, s, ms;
  h = Math.floor( time / 3600 );
  h = isNaN( h ) ? '--' : ( h >= 10 ) ? h : '0' + h;
  m = withHours ? Math.floor( time / 60 % 60 ) : Math.floor( time / 60 );
  m = isNaN( m ) ? '--' : ( m >= 10 ) ? m : '0' + m;
  s = Math.floor( time % 60 );
  s = isNaN( s ) ? '--' : ( s >= 10 ) ? s : '0' + s;
  ms = Math.floor((time - Math.floor(time)) * 1000);
  ms = isNaN( ms ) ? '--' : ( ms >= 100 ) ? ms : ( ms > 10 ) ? '0' + ms : '00' + ms;
  return withHours ? h + ':' + m + ':' + s : m + ':' + s + '.' + ms;
};
/**
 * Controller that renders lyrics, and allows interaction (i.e. set
 * timestamps via mouse/keyboard).
 *
 * @param selector DOM element to use as a container.
 * @param media HTML5 audio/video element to which the lyrics belong.
 * @param lyrics An instance of ``Lyrics``.
 * @constructor
 */
LyricsBox = function(selector, media, lyrics) {
  this.container = container = $(selector);
  this.media = media;
  this.setLyrics(lyrics);
  var self = this;
  // While the audio is playing, highlight the current word in the lyrics
  media.addEventListener('timeupdate', function(e) {
    var index = self.lyrics.getIndexForTime(e.target.currentTime);
    container.find('span').removeClass('current');
    if (index != undefined)
      self.lyrics[index].dom.addClass('current');
  }
                        );
  // Add a class to the lyrics box whenever the audio is playing.
  media.addEventListener('play',
                         function() {
                           container.addClass('playing') }
                        );
  media.addEventListener('pause',
                         function() {
                           container.removeClass('playing') }
                        );
  // Disable right click on the whole box. The word have their own
  // handlers, but accidental clicking next to a word shouldn't
  // interrupt with a context menu.
  this.container.on('contextmenu', function() {
    return false;
  }
                   );
  // Setup assigning timestamps by keypress.
  $(document).on('keydown', function(e) {
    if (Shortcuts.modalDialogVisible())
      return;
    if (e.ctrlKey)
      // Because various ctrl+X keys are used as a global shortcut as
      // well, and this means we don't have to worry about handler order.
      return;
    if (e.keyCode == 32)  {
      // Space key
      // Assign time to current index, then move cursor forward if
      // that was successful.
      if (self._assignTime(self.keyboardCursorIndex)) {
        self.setKeyboardCursorIndex(self.keyboardCursorIndex+1);
        return false;
      }
    }
    else if (e.keyCode == 46) {
      // Del key
      self.lyrics.setTimeOfWord(self.keyboardCursorIndex, null);
      self.setKeyboardCursorIndex(self.keyboardCursorIndex-1);
      return false;
    }
    else if (e.keyCode == 39) {
      // right arrow
      self.setKeyboardCursorIndex(self.keyboardCursorIndex+1);
      return false;
    }
    else if (e.keyCode == 37) {
      // left arrow
      self.setKeyboardCursorIndex(self.keyboardCursorIndex-1);
      return false;
    }
  }
                );
};
/**
 * Connect with a new lyrics object.
 *
 * @param lyrics
 */
LyricsBox.prototype.setLyrics = function(lyrics) {
  this.lyrics = lyrics;
  if (this.lyrics) {
    this.update();
    // Reset the keyboard cursor.
    this.setKeyboardCursorIndex();
  }
};
/**
 * Re-render the UI.
 */
LyricsBox.prototype.update = function() {
  var self = this;
  var container = this.container;
  var media = this.media;
  var lyrics = this.lyrics;
  function setTimeForSpan(span, time) {
    if (time) {
      span.addClass('timed');
      span.attr('title', Lyrics.toTimer(time));
    }
    else {
      span.removeClass('timed');
      span.attr('title', '');
    }
  }
  // Generate a list of words.
  this.container.empty();
  for (var index = 0; index<this.lyrics.length; index++) {
    var word = this.lyrics[index];
    var elem = $('<span>'+(word.text?word.text:'-')+'</span>');
    setTimeForSpan(elem, word.time);
    // TODO: Can be sped up by using a single handler for all spans.
    (function(word, index)
     {
       // When playing, a left click connects the word with the current
       // playing position. Use "mousedown" here (instead of click),
       // which is closer to the time the user actually decided to click.
       elem.mousedown(function(e) {
         if (e.which !== 1)
           return;
         if (self._assignTime(index))
           self.setKeyboardCursorIndex(index+1);
         else
           // If assign time fails (usually because we're not
           // playing, set the keyboard cursor the the word that was
           // clicked, instead of the next word.
           self.setKeyboardCursorIndex(index);
       }
                     );
       // On right click, start playing from that word's position.
       elem.on('contextmenu', function(e) {
         // Set the keyboard cursor here
         self.setKeyboardCursorIndex(index);
         // Bail out now if no audio is loaded
         if (media.readyState == media.HAVE_NOTHING)
           return true;
         // Otherwise, go and set the play position
         var goto = word.time;
         if (goto == null) {
           goto = lyrics.getApproximateTime(index);
         }
         media.play();
         media.currentTime = goto - 1.5;
         // go to shortly before
         e.preventDefault();
         return false;
       }
              );
     }
    )(word, index);
    word.dom = elem;
    this.container.append(elem);
    this.container.append(' ');
  }
  // As timestamps are assigned and removed, update the style of the words
  this.lyrics.on('timeChanged', function(index, time) {
    var word = container.find('span').eq(index);
    setTimeForSpan(word, time);
    // Indicate a change of value regardless of whether the timestamp
    // was removed or added.
    word.addClass('updated');
    // I'd like the animation to be defined in CSS, but this
    // is a) vendor specific and b) does't react to multiple
    // fast clicks (while the animation is still ongoing) the
    // way it is supposed to. TODO: find better solution.
    word.one('webkitAnimationEnd', function() {
      word.removeClass('updated');
    }
            );
  }
                );
};
/**
 * Set a time value for the given index, if possible.
 *
 * Internal usage, does some validation.
 */
LyricsBox.prototype._assignTime = function(index) {
  if (this.media.readyState == 0 || this.media.paused)
    return;
  if (index >= this.lyrics.length)
    return;
  this.lyrics.setTimeOfWord(index, this.media.currentTime);
  return true;
};
/**
 * Set a time value for the given index, if possible.
 *
 * Internal usage, does some validation.
 */
LyricsBox.prototype.setKeyboardCursorIndex = function(index) {
  // Validate the incoming value. If no index is given, reset to 0.
  // The key behind this construct is that if index == undefined, the
  // 'has the value changed check' below is not run.
  if (index == undefined)
    index = 0;
  else {
    index = Math.max(0, Math.min(index, this.lyrics.length-1));
    if (index == this.keyboardCursorIndex)
      return;
  }
  // Clear the old cursor
  var spans = this.container.find('span');
  if (this.keyboardCursorIndex != undefined)
    spans.eq(this.keyboardCursorIndex).removeClass('cursor');
  this.keyboardCursorIndex = index;
  // Set the new cursor
  spans.eq(this.keyboardCursorIndex).addClass('cursor');
};
