// deno-lint-ignore-file no-explicit-any

enum LogLevel {
    Fatal = 'FATAL',
    Error = 'ERROR',
    Warning = 'WARNING',
    Info = 'INFO',
    Debug = 'DEBUG',
    Trace = 'TRACE'
}

class Logger {
    protected filterFn: (level: LogLevel, message: string, metadata?: any) => Boolean = () => true

    constructor() {

    }

    withFilter(filterFn: (level: LogLevel, message: string, metadata?: any) => Boolean): Logger {
        this.filterFn = filterFn;
        return this
    }

    protected log(level: LogLevel, message: string, metadata?: any) {
        
    }

    protected _log(level: LogLevel, message: string, metadata?: any) {
        const satisfiesFilter = this.filterFn(level, message, metadata);
        if(satisfiesFilter) {
            this.log(level, message, metadata)
        }
    }

    trace(message: string, metadata?: any) {
        this._log(LogLevel.Trace, message, metadata)
    }

    debug(message: string, metadata?: any) {
        this._log(LogLevel.Debug, message, metadata)
    }

    info(message: string, metadata?: any) {
        this._log(LogLevel.Info, message, metadata)
    }

    warn(message: string, metadata?: any) {
        this._log(LogLevel.Warning, message, metadata)
    }

    error(message: string, metadata?: any) {
        this._log(LogLevel.Error, message, metadata)
    }

    fatal(message: string, metadata?: any) {
        this._log(LogLevel.Fatal, message, metadata)
    }
}

class ConsoleLogger extends Logger {
    constructor(){
        super()
    }

    protected log(level: LogLevel, message: string, metadata?: any): void {
        console.log(`[${level}] ${message}`)
    }
}

export { Logger, ConsoleLogger };