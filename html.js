/**
 * HTML component system with raw string templates.
 */

// Generic complete HTML page
export const Page = ({ body, title, mixpanelToken, myRcUserId }) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="shortcut icon" type="image/png" href="favicon.ico" />
    <link rel="stylesheet" type="text/css" href="site.css" />
    ${
      ""
      /* Mixpanel insert from https://docs.mixpanel.com/docs/quickstart/connect-your-data?sdk=javascript */
      /* NOTE: Had to double escape forward slashes, i.e. replace "\/" with "\\/" */
    }
    <script type="text/javascript">
      (function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split( " "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for ( var d = {}, e = ["get_group"].concat( Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\\/\\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
    </script>
    <script type="module">
      // import mixpanel from 'mixpanel-browser'; // This is a global from mixpanel script snippet
      mixpanel.init('${mixpanelToken}', {debug: true, track_pageview: true, persistence: 'localStorage'});
      // Set this to a unique identifier for the user performing the event.
      const userId = '${myRcUserId || ""}';
      if (document.referrer.match("rctv.recurse.com")) {
        mixpanel.identify("rctv");
      } else if (userId) {
        mixpanel.identify(userId);
      } else {
        mixpanel.reset();
      }
    </script>

  </head>
  <body>
    <script src="https://unpkg.com/htmx.org@1.9.10" integrity="sha384-D1Kt99CQMDuVetoL1lrYwg5t+9QdHe7NLX/SoJYkXDFfX37iInKRy5xLSi8nO7UC" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/htmx.org@1.9.11/dist/ext/ws.js"></script>

    ${body}
  </body>
</html>
`;

export const RootBody = ({
  rooms,
  myCustomization,
  otherCustomizations,
  noCustomizations,
  whoIsInTheHub,
}) => {
  // NOTE: This chunk is copied from the source of https://www.recurse.com/calendar
  //       Ostensibly that doesn't change very often, but you might want to check
  //       when it was last changed somehow.
  //       After copying, replaced all root relative links with absolute URLs
  //       via `s/href=\"\//href="https:\/\/www.recurse.com\//g`
  //       Also removed a few things in the menu specific to my user,
  //       which makes this more than a simple copy and paste job.
  // TODO: Next time I update this, I want to instead put it in
  //       a separate HTML file, then include it here verbatim and
  //       then filter and edit the content in JavaScript instead of
  //       manually. It will make future updates much simpler.
  let body = `
<div class="site-header site-header--fixed"><div class="site-header__content"><div class="site-header__left p-l-2"><a href="https://www.recurse.com/directory"><div class="rc-logo--default" style="height: 30px; width: 24px;"><!-- When you edit this file, make sure to bump the version in assets.es6.erb -->
<svg class="rc-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 15">
  <rect class="rc-logo__primary" x="0" y="0" width="12" height="1" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="0" y="0" width="1" height="10" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="11" y="0" width="1" height="10" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="0" y="9" width="12" height="1" fill="#2a2d2d"></rect>

  <rect class="rc-logo__primary" x="4" y="9" width="4" height="3" fill="#2a2d2d"></rect>

  <rect class="rc-logo__primary" x="1" y="11" width="10" height="1" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="1" y="11" width="1" height="4" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="10" y="11" width="1" height="4" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="1" y="14" width="10" height="1" fill="#2a2d2d"></rect>

  <rect class="rc-logo__primary" x="0" y="12" width="2" height="3" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="10" y="12" width="2" height="3" fill="#2a2d2d"></rect>

  <rect class="rc-logo__primary" x="10" y="12" width="2" height="3" fill="#2a2d2d"></rect>

  <rect class="rc-logo__primary" x="1" y="11" width="2" height="2" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="4" y="11" width="1" height="2" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="6" y="11" width="1" height="2" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="8" y="11" width="1" height="2" fill="#2a2d2d"></rect>

  <rect class="rc-logo__primary" x="9" y="13" width="2" height="2" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="7" y="13" width="1" height="2" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="5" y="13" width="1" height="2" fill="#2a2d2d"></rect>
  <rect class="rc-logo__primary" x="3" y="13" width="1" height="2" fill="#2a2d2d"></rect>

  <rect class="rc-logo__secondary" x="1" y="1" width="10" height="8" fill="#fff"></rect>
  <rect class="rc-logo__secondary" x="2" y="13" width="1" height="1" fill="#fff"></rect>
  <rect class="rc-logo__secondary" x="3" y="12" width="1" height="1" fill="#fff"></rect>
  <rect class="rc-logo__secondary" x="4" y="13" width="1" height="1" fill="#fff"></rect>
  <rect class="rc-logo__secondary" x="5" y="12" width="1" height="1" fill="#fff"></rect>
  <rect class="rc-logo__secondary" x="6" y="13" width="1" height="1" fill="#fff"></rect>
  <rect class="rc-logo__secondary" x="7" y="12" width="1" height="1" fill="#fff"></rect>
  <rect class="rc-logo__secondary" x="8" y="13" width="1" height="1" fill="#fff"></rect>
  <rect class="rc-logo__secondary" x="9" y="12" width="1" height="1" fill="#fff"></rect>

  <rect class="rc-logo__primary" x="2" y="2" width="8" height="6" fill="#2a2d2d"></rect>

  <rect class="rc-logo__accent rc-logo__pixel1" x="2" y="3" width="1" height="1" fill="#3dc06c"></rect>
  <rect class="rc-logo__accent rc-logo__pixel2" x="4" y="3" width="1" height="1" fill="#3dc06c"></rect>
  <rect class="rc-logo__accent rc-logo__pixel3" x="6" y="3" width="1" height="1" fill="#3dc06c"></rect>
  <rect class="rc-logo__accent rc-logo__pixel4" x="3" y="5" width="2" height="1" fill="#3dc06c"></rect>
  <rect class="rc-logo__accent rc-logo__pixel5" x="6" y="5" width="2" height="1" fill="#3dc06c"></rect>
</svg>
</div></a></div><div class="site-header__menu-items"><div class="site-header-section site-header-section--green site-header-section--selected"><div class="site-header-section__label"><!-- react-text: 10 -->People &amp; Events<!-- /react-text --><!-- react-text: 11 --> <!-- /react-text --></div><div class="site-header-section__menu" style="left: -100px;"><div class="site-header-section__menu-content"><div class="site-header-section__menu-inner" style="width: 350px;"><div class="p-y-1"><div class="nav-item nav-item--with-rows nav-item--green with-rule p-b-2"><a class="nav-item nav-item--large p-b-0  nav-item--green" href="https://www.recurse.com/directory" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-address-card-o"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Directory</span></div><div class="nav-item__description">Search everyone in the RC community</div></div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/directory?scope=current"><div class="nav-item__label nav-item__label--smaller"><!-- react-text: 26 -->Currently at RC<!-- /react-text --></div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/directory?scope=current&amp;role=faculty"><div class="nav-item__label nav-item__label--smaller"><!-- react-text: 29 -->Current faculty<!-- /react-text --></div></a></div><div class="nav-item nav-item--with-rows nav-item--green m-y-1 p-b-2 with-rule"><a class="nav-item nav-item--large p-b-0  nav-item--green" href="https://www.recurse.com/calendar" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-calendar"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Calendar</span></div><div class="nav-item__description">Find and organize events</div></div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://github.com/recursecenter/wiki/wiki/Event-hosting-guide"><div class="nav-item__label nav-item__label--smaller"><!-- react-text: 46 -->Guide to hosting events<!-- /react-text --></div></a></div><a class="nav-item nav-item--large   nav-item--green" href="https://www.recurse.com/niceties" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-gift"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Niceties</span></div><div class="nav-item__description">Share kind words with never-graduating Recursers</div></div></a></div></div></div></div></div><div class="site-header-section site-header-section--blue"><div class="site-header-section__label"><!-- react-text: 56 -->Discussion<!-- /react-text --><!-- react-text: 57 --> <!-- /react-text --><i class="fa fa-video-camera"></i></div><div class="site-header-section__menu" style="left: -112px;"><div class="site-header-section__menu-content"><div class="site-header-section__menu-inner" style="width: 350px;"><div class="p-y-1"><div class="nav-item nav-item--with-rows nav-item--blue"><a class="nav-item nav-item--large nav-item--blue" href="https://recurse.rctogether.com"><div class="nav-item__icon-container bg-blue"><i class="fa fa-video-camera font-size-large color-white"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Virtual RC</span></div><div class="nav-item__description">A virtual map of the RC space, where you can join video chat rooms using Zoom.</div></div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/aegis" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Aegis</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/arca" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Arca</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/couches" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Couches</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/edos" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Edos</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/faculty_area" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Faculty area</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/faculty_lounge" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Faculty lounge</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/genera" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Genera</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/kitchen" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Kitchen</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/lawson" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Lawson</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/midori" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Midori</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/pairing_station_1" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Pairing station 1</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/pairing_station_2" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Pairing station 2</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/pairing_station_3" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Pairing station 3</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/pairing_station_4" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Pairing station 4</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/pairing_station_5" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Pairing station 5</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/pomodoro_room" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Pomodoro room</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/presentation_space" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Presentation space</div></a><a class="nav-item__row nav-item__row--sub-nav" href="https://www.recurse.com/zoom/verve" target="_blank" rel="noopener noreferrer"><div class="nav-item__label nav-item__label--smaller">Verve</div></a></div><a class="nav-item nav-item--large nav-item--blue" href="https://recurse.zulipchat.com"><div class="nav-item__icon-container"><img class="nav-item__icon-image" src="https://d29xw0ra2h4o4u.cloudfront.net/assets/zulip_logo-1ae3c3ec0bd8faf6cf0f7281f59decdaf986c2e11b69a25fd5be02927066078a.png" width="25" height="25"></div><div class="nav-item__content"><div class="nav-item__label">Zulip</div><div class="nav-item__description">Real-time chat for the entire RC community</div></div></a><a class="nav-item nav-item--large nav-item--blue" href="https://community.recurse.com"><div class="nav-item__icon-container"><img class="nav-item__icon-image" src="https://d29xw0ra2h4o4u.cloudfront.net/assets/community_logo-03c1f1ba57c175e42664d6cd427c53eee219e51bdbce40829a3923ab5d43797f.png" width="30" height="30"></div><div class="nav-item__content"><div class="nav-item__label">Community</div><div class="nav-item__description">Discussion forum and mailing lists for RC announcements, regional groups, etc.</div></div></a><a class="nav-item nav-item--large nav-item--blue" href="https://github.com/recursecenter/issue-tracker/issues"><div class="nav-item__icon-container"><img class="nav-item__icon-image" src="https://d29xw0ra2h4o4u.cloudfront.net/assets/github_logo-af7175bd64cc872bed89310a4a55b8a1f776ec0191fa95e2fd0b3b7bf4f4870b.png" width="40" height="40"></div><div class="nav-item__content"><div class="nav-item__label">Issue tracker</div><div class="nav-item__description"><span><strong>GitHub login required:</strong><!-- react-text: 93 --> <!-- /react-text --><!-- react-text: 94 -->Report and track issues related to RC (software or otherwise)<!-- /react-text --></span></div></div></a></div></div></div></div></div><div class="site-header-section site-header-section--purple"><div class="site-header-section__label"><!-- react-text: 97 -->Resources<!-- /react-text --><!-- react-text: 98 --> <!-- /react-text --></div><div class="site-header-section__menu" style="left: -196px;"><div class="site-header-section__menu-content"><div class="site-header-section__menu-inner" style="width: 500px;"><div class="p-y-1 has-columns flex-wrap-wrap"><a class="nav-item nav-item--large   nav-item--purple" href="https://github.com/recursecenter/wiki/wiki" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-wikipedia-w"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Recurse Center Wiki</span></div><div class="nav-item__description"><span><strong>GitHub login required:</strong><!-- react-text: 112 --> <!-- /react-text --><!-- react-text: 113 -->Recurser and faculty maintained wiki of useful links, guides, and advice on getting the most out of RC<!-- /react-text --></span></div></div></a><a class="nav-item nav-item--large  nav-item--half-width nav-item--purple" href="https://www.recurse.com/manual" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-book"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>User's Manual</span></div><div class="nav-item__description">How to get the most out of your time at RC</div></div></a><a class="nav-item nav-item--large  nav-item--half-width nav-item--purple" href="https://github.com/recursecenter/wiki/wiki/Advice-on-finding-housing-in-New-York" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-home"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Housing advice</span></div><div class="nav-item__description">Advice for finding housing in New York</div></div></a><a class="nav-item nav-item--large  nav-item--half-width nav-item--purple" href="https://www.recurse.com/booker" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-clock-o"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Retreat office hours</span></div><div class="nav-item__description">Have a one-on-one with a Facilitator about your goals, projects, or anything else</div></div></a></div><div class="nav-subsection nav-subsection--purple"><div class="nav-subsection__header">Development</div><div><div class="nav-subsection__row"><a href="https://github.com/recursecenter/wiki/wiki/Recurse-Center-API" class="nav-subsection__link">API documentation</a></div><div class="nav-subsection__row"><a href="https://www.recurse.com/domains" class="nav-subsection__link">Register a *.recurse.com subdomain</a></div></div></div><div class="nav-subsection nav-subsection--purple p-t-0"><div class="nav-subsection__header nav-subsection__header--hacky-presentations-section-margin">Presentations</div><div><div class="nav-subsection__row"><a href="https://presentations.recurse.com" class="nav-subsection__link">Sign up to give a presentation</a></div></div></div><div class="nav-subsection nav-subsection--purple p-t-0"><div class="nav-subsection__header nav-subsection__header--hacky-blogging-section-margin">Blogging</div><div><div class="nav-subsection__row"><a href="https://blaggregator.recurse.com" class="nav-subsection__link">Blaggregator – RC blog aggregator</a></div><div class="nav-subsection__row"><a href="https://blaggregator.recurse.com/add_blog/" class="nav-subsection__link">Add your blog</a></div></div></div></div></div></div></div><div class="site-header-section site-header-section--pink"><div class="site-header-section__label"><!-- react-text: 156 -->Career services<!-- /react-text --><!-- react-text: 157 --> <!-- /react-text --></div><div class="site-header-section__menu" style="left: -179px;"><div class="site-header-section__menu-content"><div class="site-header-section__menu-inner" style="width: 500px;"><div class="with-rule p-y-1"><a class="nav-item nav-item--large   nav-item--pink" href="https://www.recurse.com/jobs/advice" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-info"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Learn what RC can do to help</span></div><div class="nav-item__description">Career advice for finding a new job, interviewing, negotiating offers, visa information, and more</div></div></a></div><div class="m-y-1 has-columns flex-wrap-wrap"><a class="nav-item nav-item--large  nav-item--half-width nav-item--pink" href="https://www.recurse.com/jobs" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-briefcase"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Jobs Chat</span></div><div class="nav-item__description">Chat with us, get advice, and manage your search</div></div></a><a class="nav-item nav-item--large  nav-item--half-width nav-item--pink" href="https://www.recurse.com/jobs/profile" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-user"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>My jobs profile</span></div><div class="nav-item__description">Skills, projects, work experience, and more</div></div></a><a class="nav-item nav-item--large  nav-item--half-width nav-item--pink" href="https://www.recurse.com/companies" target="_self" rel=""><div class="nav-item__icon-container"><i class="nav-item__icon fa fa-building-o"></i></div><div class="nav-item__content"><div class="nav-item__label"><span>Browse companies</span></div><div class="nav-item__description">Learn more about companies that work with RC</div></div></a></div><div class="nav-subsection nav-subsection--pink"><div class="nav-subsection__header">Hiring?</div><div><div class="nav-subsection__row"><a href="https://www.recurse.com/jobs/advice#want-to-intro-my-company" class="nav-subsection__link">How to start hiring from RC</a></div></div></div></div></div></div></div><div class="site-header-section site-header-section--orange"><div class="site-header-section__label"><!-- react-text: 198 -->Outreach<!-- /react-text --><!-- react-text: 199 --> <!-- /react-text --></div><div class="site-header-section__menu" style="left: -74px;"><div class="site-header-section__menu-content"><div class="site-header-section__menu-inner"><div class="p-y-1"><a class="nav-item nav-item--small nav-item--orange" href="https://www.recurse.com/outreach"><div class="nav-item__icon-container bg-off-white"><i class="nav-item__icon fa fa-envelope-o"></i></div><div class="nav-item__label"><span>Outreach templates</span></div></a><a class="nav-item nav-item--small nav-item--orange" href="https://www.recurse.com/outreach/recommend"><div class="nav-item__icon-container bg-off-white"><i class="nav-item__icon fa fa-thumbs-o-up"></i></div><div class="nav-item__label"><span>Write a recommendation</span></div></a><a class="nav-item nav-item--small nav-item--orange" href="https://www.recurse.com/outreach/ticket"><div class="nav-item__icon-container bg-off-white"><i class="nav-item__icon fa fa-ticket"></i></div><div class="nav-item__label"><span>Golden Ticket</span></div></a></div></div></div></div></div><div class="site-header-section site-header-section--green"><div class="site-header-section__label"><!-- react-text: 221 -->Admissions<!-- /react-text --><!-- react-text: 222 --> <!-- /react-text --></div><div class="site-header-section__menu" style="left: -59px;"><div class="site-header-section__menu-content"><div class="site-header-section__menu-inner"><div class="p-y-1"><a class="nav-item nav-item--small nav-item--green" href="https://www.recurse.com/private/reapply"><div class="nav-item__icon-container bg-off-white"><i class="nav-item__icon fa fa-graduation-cap"></i></div><div class="nav-item__label"><span>Apply to another batch</span></div></a></div></div></div></div></div><div class="site-header-section site-header-section--blue"><div class="site-header-section__label"><!-- react-text: 234 -->Donate<!-- /react-text --><!-- react-text: 235 --> <!-- /react-text --></div><div class="site-header-section__menu" style="left: -133px;"><div class="site-header-section__menu-content"><div class="site-header-section__menu-inner" style="width: 350px;"><div class="p-y-1"><a class="nav-item nav-item--large nav-item--blue" href="https://www.recurse.com/fund"><div style="margin-right: 0.75rem;"><img class="nav-item__icon-image" src="https://d29xw0ra2h4o4u.cloudfront.net/assets/donations/umbrella-c5671fe8d38cc77189265d52c8480e6674700f782689c22694a01bfd7a58f078.svg"></div><div class="nav-item__content"><div class="nav-item__label"><span>Never Graduate Fund</span></div><div class="nav-item__description">Help keep RC going</div></div></a></div></div></div></div></div><div class="site-header-section site-header-section--ngw"><div class="site-header-section__label"><a class="display-flex align-items-flex-end" href="https://www.recurse.com/ngw-2024"><div class="site-header-section__ngw-letters"><span>N</span><span>G</span><span>W </span><span>2</span><span>0</span><span>2</span><span>4</span></div><span class="emoji" title=":party_popper:"><span class="emoji__sprite emoji_u1f389"></span></span></a></div></div><div class="site-header__hide-when-expanded"></div></div><div class="site-header__right"></div><button class="site-header__mobile-toggle button button--link color-dark-gray font-size-large" style="margin-right: 1rem" onclick="document.querySelector('.site-header__menu-items').classList.toggle('site-header__menu-items--show-on-mobile')">Menu</button></div></div>
  `;
  body += `<main hx-ext="ws" ws-connect="/websocket">`;
  body += `<h1>RCVerse</h1>`;
  body += `
<details>
<summary>About</summary>

<p>RCVerse is a tool for all Recursers, in-batch and alum, remote and in-hub.</p>

<p>
We want to connect. We want tools to help connect us. We know how to build them. Let's build them!
</p>

<p>
The lofty, long term goal of RCVerse is to be open source, to be a website, to be a canvas
for the creativity of RCers, to be a practice ground for creative web development,
to be a space for trying out novel collaborative tools.
</p>

<p>
The more practical short-term goal for this site is to be the first place RCers
look when they sign on in the morning, to see what's going on, both virtually and
physically. To do this, we'll have to keep making it more useful over time, and
removing any friction which keeps it being as useful as it can be.
</p>

<p>
To throw your idea at the project, make a PR to
<a href="https://github.com/reedspool/rc-verse">the source code repository</a>.
Or you could slap your thoughts on the shared
 <a href="https://docs.google.com/document/d/1tLA_BjwM5k93WsMvNKT58kDb4Ksa9S6TFvGMAuK6Ldk/edit#heading=h.8rrvaio0w6r3">google doc</a>,
or message the
<a href="https://recurse.zulipchat.com/#narrow/stream/18926-help/topic/Reed's.20Impossible.20Day.3A.20Virtual.20RC.20meets.20MySpace">Zulip thread</a>,
or message Reed Spool (W2'24) directly.
</p>

<p>
The site is now open source! Check it out on <a href="https://github.com/reedspool/rc-verse">GitHub</a>.
</p>

</details>
<details>
<summary>Usage</summary>

<p>To view this page without any customizations active, add the query parameter
<code>?basic</code> or <a href="/?basic">click here</a>.</p>

<p>Normally, the rooms on the page are sorted in order of most participants to least.
To disable sorting and use a roughly alphebetical, stable room order, add the query parameter
<code>?sort=none</code> or <a href="/?sort=none">click here</a>.</p>

<p>To combine URL parameters, combine them in any order with a <code>&</code>
(ampersand) between them, and only one <code>?</code> (question mark) at the start.
E.g. <code>?basic&sort=none</code></p>
</details>
<details>
<summary>⚠ XSS vulnerability</summary>

<p>There's a new section named "Custom Code" at the bottom of the page.
All room notes are now properly HTML escaped.</p>

<p>This site has a XSS vulnerability. That means you can inject code which will
be run when other people load the page in their browser. Don't know what that
means? See if you can figure it out. Google's your friend. Ask other recursers.
Poke around.</p>

<p>You can inject CSS with a <code>style</code> tag or JavaScript with a
<code>script</code> tag.</p>

<p>Please be kind. Do not use blocking JS (like <code>alert</code>) or CSS which
makes the page (totally) unreadable. If you're writing a loop, maybe test that
out on a test HTML page first so that you don't crash this page for others.</p>

<p>Currently <a
href="https://recurse.zulipchat.com/#narrow/stream/18926-help/topic/Reed's.20Impossible.20Day.3A.20Virtual.20RC.20meets.20MySpace/near/426768844">
custom code is ephemeral</a>. Changes are likely to disappear any time. So if you make a
change you like, take a screenshot and post your code in the zulip thread! Later,
you or someone else can reapply the change.</p>

<p>Made something you think should be permanent? <a
href="https://github.com/reedspool/rc-verse">Make a PR!</a></p>
</details>

<dl class="room-list">
${WhoIsInTheHub(whoIsInTheHub)}
${rooms.map(Room).join("\n")}
</dl>

<hl>

<h2>Custom HTML</h2>

${
  noCustomizations
    ? `<p>Customizations disabled because of <code>?basic</code> query parameter</p>`
    : `
  <p>Only you can edit your customization. Your code will immediately run for everyone, so <strong>be nice</strong>.</p>

<p>Anyone can <strong>Pause</strong> anyone's customization. Customizations will be unpaused when they're updated.</p>

<p>To view this page without any customizations active, add the query parameter <code>?basic</code> or <a href="/?basic">click here</a>.</p>

<dl class="customization-list">
${
  myCustomization
    ? Customization(myCustomization)
    : `
    <div>
              <button
                hx-get="/editCustomization.html"
                hx-swap="outerHTML"
                hx-target="closest div"
              >Add your customization</button>
</div>
      <p style="border: 1px solid red; padding: 0.4em;">
      <strong>Note</strong> After you hit Update you'll need to
      refresh the page, just this first time (and hopefully I'll fix this bug first)
      </strong></p>
    `
}
${
  otherCustomizations.length === 0
    ? ""
    : otherCustomizations.map(Customization).join("\n")
}
</dl>
  `
}
<hl>

        <p>You\'re logged in! - <a href="/logout">logout</a></p>
    `;
  body += `</main>`;

  return body;
};

export const Login = ({ reason } = { reason: "" }) => `
  <main>
    <h1>RCVerse</h1>
    <h2>Whatever you make it</h2>
    ${
      reason === "deauthenticated"
        ? `<p>
          RC Auth said you're not logged in.
          This might be temporary, so you might try to refresh and be logged in.
          Please let Reed know if this happens frequently.
        </p>`
        : ""
    }
    <p><a href="/getAuthorizationUrl">Login</a></p>
  </main>
`;

export const Room = ({
  roomLocation,
  roomName,
  isEmpty,
  participants,
  hasNote = false,
  noteContent,
  noteDateTime,
  noteHowManyMinutesAgo,
  countPhrase,
  hasNowEvent,
  nowEventName,
  nowEventStartedHowManyMinutesAgo,
  nowEventCalendarUrl,
  nowEventDateTime,
  hasNextEvent,
  nextEventName,
  nextEventStartsInHowLong,
  nextEventCalendarUrl,
  nextEventDateTime,
}) => `
      <div id="room-update-${roomName.replaceAll(
        " ",
        "-",
      )}" class="display-contents">
        <div class="room ${isEmpty ? "room--non-empty" : ""}">
          <dt class="room__header">
            <span class="room__header-title">
              <span class="room__title">${roomName}</span>
              <a
                class="room__join"
                href="${roomLocation}"
                target="_blank"
                rel="noopener noreferrer"
                >
                Join
              </a>
            </span>
            <span class="room__count">${countPhrase}</span>
          </dt>
          <dd class="room__details">
            ${Participants({ participants })}
            ${
              hasNowEvent
                ? `
                   <div class="room__event-now">
                     <a href="${nowEventCalendarUrl}" target="_blank">${nowEventName}</a>
                     started
                     <time datetime="${nowEventDateTime}" title="${nowEventDateTime} UTC">
                       ${nowEventStartedHowManyMinutesAgo}
                     </time>
                   </div> `
                : ""
            }
            ${
              hasNextEvent
                ? `
                   <div class="room__event-next">
                     <a href="${nextEventCalendarUrl}" target="_blank">${nextEventName}</a>
                     starts
                     <time datetime="${nextEventDateTime}" title="${nextEventDateTime} UTC">
                       ${nextEventStartsInHowLong}
                     </time>
                   </div> `
                : ""
            }
            ${Note({
              roomName,
              hasNote,
              noteContent,
              noteDateTime,
              noteHowManyMinutesAgo,
            })}
          </dd>
        </div>
      </div>
    `;

export const Note = ({
  roomName,
  hasNote,
  noteContent,
  noteDateTime,
  noteHowManyMinutesAgo,
}) =>
  `
<div class="display-contents">
  <div class="room__note">${noteContent}</div>
  <span class="room__note-updates">
    <button
      class="room__note-edit-button"
      hx-get="/note.html?roomName=${roomName}"
      hx-swap="outerHTML"
      hx-target="closest div"
    >${hasNote ? "Edit note" : "Add note"}</button>
    ${
      hasNote
        ? `<span class="room__note-update-time" title="${noteDateTime} UTC">
             Updated
             <time datetime="${noteDateTime}">
               ${noteHowManyMinutesAgo}
             </time>
           </span>`
        : ""
    }
  </span>
</div>
`;

export const EditNoteForm = ({ roomName, noteContent }) =>
  `
      <form method="POST" action="/note" hx-post="/note" hx-swap="none" class="note-editor">
          <input type="hidden" name="room" value="${roomName}">
          <label class="note-editor__form-item">
              Note
              <textarea name="content" class="note-editor__text-input" cols="33" rows="5">${noteContent}</textarea>
          </label>
          <button type="submit">Update note</button>
       </form>
`;

export const Participants = ({ participants }) =>
  `<div class="participants">${participants
    .map((p) => Participant(p))
    .join("")}</div>`;

export const Participant = ({ participantName, faceMarkerImagePath }) =>
  `
  <img
      class="participants__participant"
      src=${faceMarkerImagePath}
      title="${participantName}">
  `;

export const Customization = ({
  rcUserId,
  rcPersonName,
  code,
  isMine,
  isEmpty,
  isNew,
  isPaused,
}) => `
      <div id="customization-update-${String(
        rcUserId,
      )}" class="display-contents" hx-swap-oob="${
        isNew ? "afterbegin" : "true"
      }">
        <div class="customization ${isEmpty ? "customization--non-empty" : ""}">
          <dt class="customization__header">
            <span class="customization__title">${
              isMine
                ? `<strong>My Code (${rcPersonName})</strong>`
                : `${rcPersonName}'s Code`
            }</span>
          </dt>
          <dd class="customization__code">
            <div>
              ${
                isPaused
                  ? `<strong>Paused</strong>`
                  : `<button class="customization__pause-button" hx-post="/pauseCustomizationConfirmation.html?rcUserId=${rcUserId}" hx-swap="outerHTML">Pause ${rcPersonName}'s customization</button>`
              }
            </div>
            <div class="display-contents">
              <pre class="customization__code-preformatted"><code>${code}</code></pre>
              ${
                isMine
                  ? `<button
                       hx-get="/editCustomization.html"
                       hx-swap="outerHTML"
                       hx-target="closest div"
                     >Edit code</button>`
                  : ``
              }
            </div>
          </dd>
        </div>
      </div>
    `;

export const PauseCustomizationConfirmationButton = ({ rcUserId }) =>
  `
    <button class="customization__pause-button customization__pause-button--confirmation" hx-post="/pauseCustomization?rcUserId=${rcUserId}" hx-swap="none"><em>Really</em> pause it for <strong>everyone</strong>!?</button>
  `;

export const EditCustomizationCodeForm = ({ code }) =>
  `
      <form method="POST" action="/customization" hx-post="/customization" hx-swap="none" class="customization-editor">
          <label class="customization-editor__form-item">
              Code
              <textarea name="code" class="customization-editor__text-input" cols="60" rows="20">${code}</textarea>
          </label>
          <button type="submit">Update</button>
       </form>
`;

export const WhoIsInTheHub = ({ isEmpty, participants, iAmCheckedIn }) =>
  `
    <div id="in-the-hub-update" class="display-contents">
      <div class="room ${isEmpty ? "room--non-empty" : ""}">
        <dt class="room__header">
          <span class="room__title">Who is in the hub?</span>

          ${
            iAmCheckedIn
              ? "(you are!)"
              : `<button class="room__title-button" hx-post="/checkIntoHub" hx-swap="none">
                   Check in
                 </button>`
          }
        </dt>
        <dd class="room__details">
          ${Participants({ participants })}
        </dd>
      </div>
    </div>
  `;

export const CheckIntoHubForm = () =>
  `
    <form method="POST" action="/checkIntoHub" hx-post="/checkIntoHub" hx-swap="none" class="customization-editor">
        <label class="customization-editor__form-item">
            Note
            <textarea name="code" class="customization-editor__text-input" cols="60" rows="20"></textarea>
        </label>
        <button type="submit">Check in</button>
     </form>
  `;

// Stolen from NakedJSX https://github.com/NakedJSX/core
// Appears to be adapted from this SO answer https://stackoverflow.com/a/77873486
export const escapeHtml = (text) => {
  const htmlEscapeMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return text.replace(/[&<>"']/g, (m) => htmlEscapeMap[m] ?? "");
};
