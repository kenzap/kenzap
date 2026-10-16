const crypto = require('crypto');

class Actions {

    // init class
    constructor(actions, settings, title, namespace) {

        this.actions = actions;
        this.settings = settings;
        this.title = title;
        this.namespace = namespace;

        this.variables = {};
    }

    apply(trigger, content) {

        if (!this.actions) return content;

        // apply actions
        this.actions.forEach(o => {

            if (o.trigger !== trigger) return;

            let action = o.action.split("(")[0];

            let args;

            switch (action) {

                case "setValue":

                    args = o.action.match(/\(([^)]+)\)/)[1].split(',').map(arg => arg.trim().replace(/['"]/g, ''));
                    this[action](...args);
                    break;

                case "genToken":

                    args = o.action.match(/\(([^)]+)\)/)[1].split(',').map(arg => arg.trim().replace(/['"]/g, ''));
                    this[action](...args);
                    break;

                case "replaceValue":

                    args = o.action.match(/\(([^)]+)\)/)[1].split(',').map(arg => arg.trim().replace(/['"]/g, ''));
                    args.push(content);
                    content = this[action](...args);
                    break;

                case "setNamespace":

                    args = o.action.match(/\(([^)]+)\)/)[1].split(',').map(arg => arg.trim().replace(/['"]/g, ''));
                    args.push(content);
                    content = this[action](...args);
                    break;

                case "setEndpoint":

                    args = o.action.match(/\(([^)]+)\)/)[1].split(',').map(arg => arg.trim().replace(/['"]/g, ''));
                    args.push(content);
                    content = this[action](...args);
                    break;

                case "setEndpointHttps":

                    args = o.action.match(/\(([^)]+)\)/)[1].split(',').map(arg => arg.trim().replace(/['"]/g, ''));
                    args.push(content);
                    content = this[action](...args);
                    break;
            }
        });

        return content;
    }

    setValue(variable, value) {

        if (!this.variables[variable]) this.variables[variable] = value;
    }

    genToken(variable, length) {

        if (!this.variables[variable]) {
            const size = Math.max(1, Math.min(128, Number(length) || 24));
            this.variables[variable] = 'k' + crypto.randomBytes(size).toString('hex').slice(0, size - 1);
        }
    }

    replaceValue(from, to, content) {

        // console.log("replaceValue", from, this.variables[to]);

        return content.replace(new RegExp(from, 'g'), () => this.variables[to] || '');
    }

    setNamespace(namespace, content) {

        // console.log("namespace", this.namespace);

        return content.replace(new RegExp(namespace, 'g'), this.namespace);
    }

    setEndpoint(slug, content) {

        let endpoint = this.settings.endpoint || `${this.namespace}.endpoint-${this.settings.id.toLowerCase()}.kenzap.cloud`;

        return content.replace(new RegExp(slug, 'g'), endpoint);
    }

    setEndpointHttps(slug, content) {

        let endpoint = this.settings.endpoint ? `http://${this.settings.endpoint}` : `https://${this.namespace}.endpoint-${this.settings.id.toLowerCase()}.kenzap.cloud`;

        return content.replace(new RegExp(slug, 'g'), endpoint);
    }
}

module.exports = { Actions };
