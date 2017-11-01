var fs = require('fs');
var gracefulFs = require('graceful-fs');
gracefulFs.gracefulify(fs);

var webpack = require('webpack'),
    CopyWebpackPlugin = require('copy-webpack-plugin'),
    path = require('path');

const ROOT = path.resolve('.');

module.exports = {
    stats: { colors: true, reasons: true },
    debug: true,

    output: {
        path : path.resolve('dist'),
        filename: '[name].js',
        chunkFilename: '[id].chunk.js'
    },

    entry: {
        'beyond-grammar-plugin' : "./src/beyond-grammar-tinymce-plugin.ts",
        "i18n-en" : "expose?GrammarChecker_lang_en!./src/i18n/en.ts"
    },

    plugins: [
        function()
		{
			this.plugin("done", function(stats)
			{
				if (stats.compilation.errors && stats.compilation.errors.length)
				{
					console.log(stats.compilation.errors);
					process.exit(1);
				}
				// ...
			});
		},
        new CopyWebpackPlugin([
            { from: './src/tinymce.html', to: './' },
            { context : './src', from: {glob : './icons/**/*'}, to:'./' },
        ])
    ],

    resolve: {
        extensions: [ '', '.ts', '.es6', '.js', '.json' ],
        modules: [
            path.join(ROOT, "modules"),
            path.join(ROOT, 'node_modules'),
            'node_modules'
        ]
    },
    module: {
        loaders: [
            {test: /\.ts$/, loader: 'ts-loader?project=./tsconfig.json'},
            {test : /\.png$/, loader : "url-loader"}
        ]
    },

    devServer: {
        contentBase: './',
        quite: false,
        proxy: {
            "/api/v1": {
                target: "http://rtgrammarapi.azurewebsites.net/",
                changeOrigin: true
            },
            "/api/language": {
                target: "http://rtgrammarapi.azurewebsites.net/",
                changeOrigin: true
            }
        }
    }
};

