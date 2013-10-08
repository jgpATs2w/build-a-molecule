// Copyright 2002-2013, University of Colorado

/**
 * 3D Molecule display that takes up the entire screen
 *
 * TODO: custom rotation, ball and stick view, perspective, optimization
 *
 * @author Jonathan Olson <olsonsjc@gmail.com>
 */

define( function( require ) {
  'use strict';

  var namespace = require( 'BAM/namespace' );
  var Constants = require( 'BAM/Constants' );
  var inherit = require( 'PHET_CORE/inherit' );
  var Vector2 = require( 'DOT/Vector2' );
  var Vector3 = require( 'DOT/Vector3' );
  var Bounds2 = require( 'DOT/Bounds2' );
  var Matrix3 = require( 'DOT/Matrix3' );
  var Quaternion = require( 'DOT/Quaternion' );
  var Node = require( 'SCENERY/nodes/Node' );
  var DOM = require( 'SCENERY/nodes/DOM' );
  var Path = require( 'SCENERY/nodes/Path' );
  var Text = require( 'SCENERY/nodes/Text' );
  var Rectangle = require( 'SCENERY/nodes/Rectangle' );
  var Color = require( 'SCENERY/util/Color' );
  var Util = require( 'SCENERY/util/Util' );
  var Arc = require( 'KITE/segments/Arc' );
  var EllipticalArc = require( 'KITE/segments/EllipticalArc' );
  var DotUtil = require( 'DOT/Util' );
  var Ray3 = require( 'DOT/Ray3' );
  var Element = require( 'NITROGLYCERIN/Element' );
  
  var fillMode = 3; // 0: flat, 1: pre-rendered pattern, 2: BAM/BCE gradient, 3: custom gradient
  
  function to3d( atom ) {
    var v = new Vector3( atom.x3d(), atom.y3d(), atom.z3d() ).times( 75 ); // similar to picometers from angstroms? hopefully?
    v.element = atom.element;
    v.radius = atom.element.radius;
    v.color = atom.element.color;
    return v;
  }
  
  function ellipticalArcCut( ra, rb, d, theta ) {
    if ( theta > Math.PI / 2 ) {
      // other one is in front, bail!
    }
    
    // 2d circle-circle intersection point
    var ix = ( d * d + ra * ra - rb * rb ) / ( 2 * d );
    var iy = ra * Math.sqrt( 1 - ix * ix / ( ra * ra ) );
    
    // elliptical arc center
    var cx = ix * Math.sin( theta );
    var cy = 0;
    
    // elliptical semi-minor/major axes
    var rx = iy * Math.cos( theta );
    var ry = iy;
    
    var cutoffTheta = Math.atan2( ix, iy ); // yes, tan( ix/iy ) converts to this, don't let your instincts tell you otherwise
    
    if ( theta < cutoffTheta - 1e-7 ) {
      // no arc needed
      return null;
    }
    
    var nx = ix / ( ra * Math.sin( theta ) );
    
    // start angle for our elliptical arc (from our ra circle's parametric frame)
    var psi = Math.acos( nx );
    
    // start angle for our elliptical arc (from the elliptical arc's parametric frame)
    var alpha = Math.atan2( ra * Math.sqrt( 1 - nx * nx ) / ry, ( ra * nx - cx ) / rx );
    
    return {
      ix: ix,
      iy: iy,
      cx: cx,
      cy: cy,
      rx: rx,
      ry: ry,
      nx: nx,
      psi: psi,
      alpha: alpha
    };
  }
  
  // var sunDirection = new Vector3( -1, 0.5, 2 ).normalized();
  // var moonDirection = new Vector3( 2, -1, 1 ).normalized();
  // var sunWeight = 0.8;
  // var moonWeight = 0.6;
  // function shade( element, normal ) {
  //   var baseColor = new Color( element.color );
  //   var sunTotal = Math.max( 0, normal.dot( sunDirection ) ) * sunWeight;
  //   var moonTotal = Math.max( 0, normal.dot( moonDirection ) ) * moonWeight;

  //   var weight = Math.min( 1, sunTotal + moonTotal );
    
  //   return 'rgb(' +
  //          Math.floor( weight * baseColor.red ) + ',' +
  //          Math.floor( weight * baseColor.green ) + ',' +
  //          Math.floor( weight * baseColor.blue ) + ')';
  // }
  
  // function shadedCanvas( element, size ) {
  //   var canvas = document.createElement( 'canvas' );
  //   canvas.width = size;
  //   canvas.height = size;
  //   var context = canvas.getContext( '2d' );
    
  //   var step = 2 / size; // sample at the centers of pixels
  //   for ( var idx = 0; idx < size; idx++ ) {
  //     var x = -1 + ( idx + 0.5 ) * step;
  //     for ( var idy = 0; idy < size; idy++ ) {
  //       var y = 1 - ( idy + 0.5 ) * step; // inverse Y for 3d style
        
  //       var intersection = DotUtil.sphereRayIntersection( 1, new Ray3( new Vector3( x, y, 2 ), Vector3.Z_UNIT.negated() ) );
  //       var normal = intersection ? intersection.normal : new Vector3( x, y, 0 ).normalized(); // shade as the closest point on the sphere if we miss
        
  //       context.fillStyle = shade( element, normal );
  //       context.fillRect( idx, idy, 1, 1 );
  //     }
  //   }
  //   return canvas;
  // }
  
  // var elementPatterns = {};
  // var tmpContext = document.createElement( 'canvas' ).getContext( '2d' );
  // var elementPatternTransforms = {};
  // _.each( Element.elements, function( element ) {
  //   var size = 128;
  //   var canvas = shadedCanvas( element, size );
  //   var pattern = tmpContext.createPattern( canvas, 'no-repeat' );
  //   elementPatterns[element.symbol] = pattern;
  //   var matrix = new Matrix3( 2 * element.radius / size, 0,                         -element.radius,
  //                             0,                         2 * element.radius / size, -element.radius,
  //                             0,                         0,                         1 );
  //   elementPatternTransforms[element.symbol] = matrix.inverted();
  //   // pattern.setTransform( matrix.toSVGMatrix() );
  // } );

  var Molecule3DNode = namespace.Molecule3DNode = function Molecule3DNode( completeMolecule, trail ) {
    var that = this;
    Node.call( this, {} );
    
    var useHighRes = false;
    
    var scene = trail.rootNode();
    var view = _.find( trail.nodes, function( node ) { return node.isBAMView; } );
    
    var background = new Rectangle( 0, 0, 50, 50, { fill: 'rgba(0,0,0,0.7)' } );
    this.addChild( background );
    
    var width = 0;
    var height = 0;
    var matrix = trail.getMatrix();
    
    var canvas = document.createElement( 'canvas' );
    var context = canvas.getContext( '2d' );
    
    var backingScale = 1;
    if ( useHighRes ) {
      backingScale = Util.backingScale( context );
    }
    
    canvas.className = 'canvas-3d';
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    var dom = new DOM( canvas );
    this.addChild( dom );
    
    function updateLayout() {
      var sceneWidth = window.innerWidth;
      var sceneHeight = window.innerHeight;
      var newMatrix = trail.getMatrix();
      if ( sceneWidth === width && sceneHeight === height && matrix.equals( newMatrix ) ) {
        return;
      }
      width = sceneWidth;
      height = sceneHeight;
      matrix = newMatrix;
      
      background.rectWidth = width;
      background.rectHeight = height;
      
      var radius = 200;
      var centerX = Constants.stageSize.width / 2;
      var centerY = Constants.stageSize.height / 2;
      var bounds = new Bounds2( centerX - radius, centerY - radius, centerX + radius, centerY + radius );
      var globalBounds = view.localToGlobalBounds( bounds ).roundedOut();
      
      canvas.width = globalBounds.width * backingScale;
      canvas.height = globalBounds.height * backingScale;
      canvas.style.width = globalBounds.width + 'px';
      canvas.style.height = globalBounds.height + 'px';
      canvas.style.left = globalBounds.x + 'px';
      canvas.style.top = globalBounds.y + 'px';
      canvas.style.backgroundColor = '#000';
      context.clearRect( 0, 0, canvas.width, canvas.height );
      context.fillStyle = 'rgba(0,255,0,0.5)';
      context.fillRect( 0, 0, canvas.width, canvas.height );
      dom.invalidateSelf( globalBounds );
    }
    updateLayout();
    scene.addEventListener( 'resize', updateLayout );
    view.addEventListener( 'bounds', updateLayout );
    
    var currentAtoms = completeMolecule.atoms.map( to3d );
    
    var maxTotalRadius = 0;
    _.each( currentAtoms, function( atom ) {
      maxTotalRadius = Math.max( maxTotalRadius, atom.magnitude() + atom.radius );
    } );
    
    function draw() {
      var width = canvas.width;
      var height = canvas.height;
      var midX = width / 2;
      var midY = height / 2;
      context.setTransform( 1, 0, 0, 1, 0, 0 );
      context.clearRect( 0, 0, width, height );
      var bigScale = width / maxTotalRadius / 2.5;
      context.setTransform( bigScale, 0, 0, bigScale, midX - bigScale * midX, midY - bigScale * midY );
      
      var atoms = _.sortBy( currentAtoms, function( v ) { return v.z; } );
      
      for ( var i = 0; i < atoms.length; i++ ) {
        var atom = atoms[i];
        var element = atom.element;
        
        var arcs = [];
        
        // check each atom behind this one for occlusion
        for ( var k = 0; k < i; k++ ) {
          var otherAtom = atoms[k];
          
          var delta = otherAtom.minus( atom );
          var d = delta.magnitude();
          if ( d < atom.radius + otherAtom.radius - 1e-7 ) {
            var theta = delta.angleBetween( new Vector3( 0, 0, -1 ) );
            var arcData = ellipticalArcCut( atom.radius,  otherAtom.radius, d, theta );
            if ( arcData ) {
              // angle to center of ellipse
              var phi = Math.atan2( delta.y, delta.x );
              var center = new Vector2( arcData.cx, arcData.cy ).rotated( phi );
              arcs.push( {
                center: center,
                rx: arcData.rx,
                ry: arcData.ry,
                rotation: phi,
                circleStart: phi - arcData.psi,
                circleEnd: phi + arcData.psi,
                ellipseStart: -arcData.alpha,
                ellipseEnd: arcData.alpha
              } );
            }
          }
        }
        
        arcs = _.sortBy( arcs, function( arc ) { return arc.circleStart; } );
        
        context.save();
        context.translate( midX + atom.x, midY + atom.y );
        context.beginPath();
        // var transformMatrix = fillMode === 1 ? elementPatternTransforms[element.symbol] : Matrix3.IDENTITY;
        var transformMatrix = Matrix3.IDENTITY;
        var inverseTransformMatrix = transformMatrix.inverted();
        var arc, ellipticalArc;
        if ( inverseTransformMatrix !== Matrix3.IDENTITY ) {
          inverseTransformMatrix.canvasAppendTransform( context );
        }
        if ( arcs.length ) {
          for ( var j = 0; j < arcs.length; j++ ) {
            ellipticalArc = new EllipticalArc( arcs[j].center,
                                               arcs[j].rx, arcs[j].ry,
                                               arcs[j].rotation,
                                               arcs[j].ellipseStart, arcs[j].ellipseEnd, false );
            var atEnd = j + 1 === arcs.length;
            arc = new Arc( Vector2.ZERO, atom.radius, arcs[j].circleEnd, atEnd ? ( arcs[0].circleStart + Math.PI * 2 ) : arcs[j+1].circleStart, false );
            if ( transformMatrix !== Matrix3.IDENTITY ) {
              ellipticalArc = ellipticalArc.transformed( transformMatrix );
              arc = arc.transformed( transformMatrix );
            }
            ellipticalArc.writeToContext( context );
            arc.writeToContext( context );
          }
        } else {
          if ( transformMatrix !== Matrix3.IDENTITY ) {
            // workaround for 
            arc = new Arc( transformMatrix.timesVector2( Vector2.ZERO ), transformMatrix.m00() * atom.radius, 0, Math.PI * 2, false );
          } else {
            arc = new Arc( Vector2.ZERO, atom.radius, 0, Math.PI * 2, false );
          }
          arc.writeToContext( context );
        }
        switch ( fillMode ) {
          case 0:
            context.fillStyle = atom.color;
            break;
          case 1:
            // context.fillStyle = elementPatterns[element.symbol];
            break;
          case 2:
            // copied from BAM's AtomNode
            // var diameter = atom.radius * 2;
            // var gCenter = new Vector2( -atom.radius / 3, -atom.radius / 3 );
            // var middleRadius = diameter / 3;
            // var fullRadius = middleRadius + 0.7 * diameter;
            // var gradientFill = context.createRadialGradient( gCenter.x, gCenter.y, 0, gCenter.x, gCenter.y, fullRadius );
            // gradientFill.addColorStop( 0, '#ffffff' );
            // gradientFill.addColorStop( middleRadius / fullRadius, element.color );
            // gradientFill.addColorStop( 1, '#000000' );
            // context.fillStyle = gradientFill;
            break;
          case 3:
            // custom
            var diameter = atom.radius * 2;
            var gCenter = new Vector2( -atom.radius / 5, -atom.radius / 5 );
            var middleRadius = diameter / 3;
            var fullRadius = gCenter.minus( new Vector2( 1, 1 ).normalized().times( atom.radius ) ).magnitude();
            var gradientFill = context.createRadialGradient( gCenter.x, gCenter.y, 0, gCenter.x, gCenter.y, fullRadius );
            
            var baseColor = new Color( element.color );
            gradientFill.addColorStop( 0, baseColor.colorUtilsBrighter( 0.5 ).toCSS() );
            gradientFill.addColorStop( 0.08, baseColor.colorUtilsBrighter( 0.2 ).toCSS() );
            gradientFill.addColorStop( 0.4, baseColor.colorUtilsDarker( 0.1 ).toCSS() );
            gradientFill.addColorStop( 0.8, baseColor.colorUtilsDarker( 0.4 ).toCSS() );
            gradientFill.addColorStop( 0.95, baseColor.colorUtilsDarker( 0.6 ).toCSS() );
            gradientFill.addColorStop( 1, baseColor.colorUtilsDarker( 0.4 ).toCSS() );
            context.fillStyle = gradientFill;
            break;
        }
        context.fill();
        context.restore();
      }
    }
    
    var upCursor = '-webkit-grab, -moz-grab, grab, pointer';
    var downCursor = '-webkit-grabbing, -moz-grabbing, grabbing, move';
    canvas.style.cursor = upCursor;
    
    var dragging = false;
    
    function tick( timeElapsed ) {
      var matrix;
      if ( !dragging && currentPosition.equals( lastPosition ) ) {
        matrix = Matrix3.rotationY( timeElapsed );
      } else {
        var correctScale = 4 / canvas.width;
        var delta = currentPosition.minus( lastPosition );
        var quat = Quaternion.fromEulerAngles(
          -delta.y * correctScale, // yaw
          delta.x * correctScale,  // roll
          0                        // pitch
        );
        matrix = quat.toRotationMatrix();
        lastPosition = currentPosition;
      }
      _.each( currentAtoms, function( atom ) {
        matrix.multiplyVector3( atom );
      } );
      draw();
    }
    
    namespace.timeTick.on( 'tick', tick );
    
    var lastPosition = Vector2.ZERO;
    var currentPosition = Vector2.ZERO;
    var dragListener = {
      up: function( event ) {
        dragging = false;
        event.pointer.removeInputListener( dragListener );
        event.handle();
        canvas.style.cursor = upCursor;
      },
      
      cancel: function( event ) {
        dragging = false;
        event.pointer.removeInputListener( dragListener );
        canvas.style.cursor = upCursor;
      },
      
      move: function( event ) {
        currentPosition = event.pointer.point.copy();
      }
    };
    dom.addInputListener( {
      up: function( event ) {
        event.handle();
      },
      
      down: function( event ) {
        if ( !dragging ) {
          dragging = true;
          lastPosition = currentPosition = event.pointer.point.copy();
          event.pointer.addInputListener( dragListener );
          canvas.style.cursor = downCursor;
        }
      }
    } );
    
    this.addInputListener( {
      up: function( event ) {
        scene.removeEventListener( 'resize', updateLayout );
        view.removeEventListener( 'bounds', updateLayout );
        scene.removeChild( that );
        namespace.timeTick.off( 'tick', tick );
      }
    } );
  };

  return inherit( Node, Molecule3DNode );
} );