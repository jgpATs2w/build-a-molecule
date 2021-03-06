// path to test base, without a slash, e.g. '../../common/scenery/tests/qunit'
function runBuildAMoleculeTests( pathToTestBase ) {
  function loadTestFile( src ) {
    var script = document.createElement( 'script' );
    script.type = 'text/javascript';
    script.async = false;

    // make sure things aren't cached, just in case
    script.src = pathToTestBase + '/' + src + '?random=' + Math.random().toFixed( 10 );

    document.getElementsByTagName( 'head' )[0].appendChild( script );
  }

  loadTestFile( 'js/model.js' );
  loadTestFile( 'js/linting.js' );
};
