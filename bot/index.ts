import { Whatsapp } from 'venom-bot'
import axios from 'axios'

type CurrentClients = {
    phone_number: string,
    current_cv: string,
    timestamp: number
}

type ReceitaData = {
    atividade_principal: [
        {
            code: string
        }
    ],
    atividades_secundarias: [
        {
            code: string
        }
    ],
    nome: string,
    municipio: string,
    situacao: string,
    uf: string

}

type CheckCnpjData = [ReceitaData, string] 


export class WppBot {
    client: Whatsapp
    c_messages: CurrentClients[]
    forbidden_citys: string[]

    constructor(
        client: Whatsapp, 
        c_messages: CurrentClients[] = [] ) {
        this.client = client
        this.c_messages = c_messages
        this.forbidden_citys = ["arinosmg"]        
    }

    private botAnswers = {
        MESSAGE_1: `Olá, ficamos felizes por entrar em contato. 
Você possui CNPJ no setor do vestuário?
Responda com sim ou não.`,
        MESSAGE_2_POSITIVE: "Agora digite seu CNPJ somente com os números.",
        MESSAGE_2_NEGATIVE: `Entendemos. Nesse caso, vamos te encaminhar para uma vendedora analisar sua situação.
Para adiantar, nos informe seu nome, sua cidade, e nome da sua loja.`,
        MESSAGE_3_CNPJ_TRUE: function(name: string){
return `Conferimos seus dados e está tudo certo.
Seja muito bem vinda(o) ${name}
Para comprar clique no link 👉 https://catalogoch3.store e confira nossas peças disponíveis. Qualquer dúvida, estamos dispostas a atendê-la(o).`
        },
        MESSAGE_2_RANDOM: `Ops, você digitou algo diferente de \"sim\" ou \"não\" e nosso atendimento automático não pode entender. 
Digite a resposta correta, ou envie \"sair\" para sair do atendimento.`,
        MESSAGE_3_CNPJ_FALSE: `Precisamos que tenha um CNPJ do setor do vestuário.
Para mais esclarecimentos diga  \"Falar com atendente\" para falar com uma de nossas vendedoras`,
        MESSAGE_3_NOT_FOUND: `Ops, digitou errado? Não foi possível encontrar dados referente ao valor digitado.
Tente novamente, ou digite \"sair\" para parar de receber essa mensagem.`,
        MESSAGE_3_CLIENT_GIVEUP: `Ops, você digitou algo diferente de um CNPJ e nosso atendente automático não pode entender.
tente enviar seu CNPJ novamente ou envie \"sair\" para parar de receber essa mensagem`,
        MESSAGE_3_FORBIDDEN_CITY: function(city: string){
            return `Infelizmente, possuímos clientes na sua cidade (${city}) e nossas políticas não permitem que haja mais.
De toda forma agradecemos o interesse e quem sabe podemos formar uma parceria em outro momento.
Se desejar falar com uma vendedora envie \"Falar com atendente\".`
        },
        MESSAGE_3_CLIENT_INATIVE: function(situation: string) {
            return `Desculpe, verificamos que a situação do seu CNPJ está: ${situation}.
Não podemos enviar nosso catálogo nesse caso. Se desejar falar com uma vendedora envie \"Falar com atendente\".`
        }
    }
    
    // Cleaning memory of messages that were  sendend more then 12 hours ago
    private _cleanMemory() {
        const result = [] as number []
        this.c_messages.forEach((item, idx) => {
            const newDate = new Date()
            const X12hoursAgo = newDate.getTime() - (12 * 60 * 60 * 1000) // 12hours
            if (item.timestamp < X12hoursAgo) {
                result.push(idx)
            }
        })
        this.c_messages = this.c_messages.filter((item, idx) => !result.includes(idx))
    }

    private _getChatClient(contact_number: string) {
        return this.c_messages.filter(item => item.phone_number === contact_number) 
    }
    

    private _getClientIndex(contact_number: string){
        return this.c_messages.map(item => item.phone_number).indexOf(contact_number)
    }

    private _removeClientFromList(number:string) {
        const clientIndex = this._getClientIndex(number)
        this.c_messages = this.c_messages.filter((el, index) => index !== clientIndex)
    }

    private _getCase(c_client: CurrentClients[] = [], msg: string) {
        if (msg === "falarcomatendente") return "CASE_ATTENDANT"
        if (c_client.length && msg === "sair") return "CASE_END_OF_CHAT"
        if (msg === "Olá, desejo comprar no atacado.") return "CASE_1"
        if (c_client.length && c_client[0].current_cv === "CASE_2" && 
        msg === "sim") return "CASE_2_POSITIVE"
        if (c_client.length && c_client[0].current_cv === "CASE_2" && 
        msg === "nao") return "CASE_2_NEGATIVE"
        if (c_client.length && c_client[0].current_cv === "CASE_2" &&
        msg !== "sim" && msg !== "nao") return "CASE_2_RANDOM"
        if (c_client.length && c_client[0].current_cv === "CASE_3") return "CASE_3"
    }

    private _treatMessage(message:string) {
        let spaceSplited = message.trim().split(' ')
        let messageTrated = [] as string[]
        spaceSplited.forEach(item => {
                messageTrated.push(item
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/\p{Diacritic}/gu, "")
                    .replace(/[.,\s/-]/g, ""))
        })
        return messageTrated.join('')
    }

    private _treatClientName(name:string) {
        let spaceSplited = name.trim().split(' ')
        let messageTrated = [] as string[]
        spaceSplited.forEach(item => {
            let pushItem = []
            pushItem.push(item[0].toUpperCase().replace(/[0-9]/g, ""))
            pushItem.push(item.slice(1, item.length).toLowerCase().replace(/[0-9]/g, ""))

            messageTrated.push(pushItem.join(''))
        })
        return messageTrated.join(' ')
    }
    
    private async _getDataFromReceita(cnpj:string) {
        try {
            const response = await axios.get(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`)
            return response.data
        } catch {
            return 'false'
        }
        
    }

    private async _checkCNPJ(cnpj: string): Promise<[ReceitaData, string ]> {
        const cnpj_data: ReceitaData = await this._getDataFromReceita(cnpj)
        if (cnpj_data.situacao !== "ATIVA") {
            return [cnpj_data, "CNPJ_BAIXADO"]
        }
        if (!cnpj_data.atividade_principal) {
            return [cnpj_data, "NOT_FOUND"]
        }
        const result = []
        if (cnpj_data.atividade_principal) {
            for (let activity of cnpj_data.atividade_principal) {
                result.push(activity.code)
            }
        }
        if (cnpj_data.atividades_secundarias) {
            for (let activity of cnpj_data.atividades_secundarias) {
                result.push(activity.code)
            }
        }
        if (result.length && result.includes("47.81-4-00")) {
            return  [cnpj_data, "CNPJ_TRUE"]
        }
        if (result.length && !result.includes("47.81-4-00")) {
            return [cnpj_data, "CNPJ_FALSE"]
        }
        return [{} as ReceitaData, '']
    }

    public start() {
        this.client.onMessage(async (message) => {
            this._cleanMemory()
            const first_message = "Olá, desejo comprar no atacado."
            const message_to_case = message.body === first_message ? first_message : this._treatMessage(message.body)
            const current_client = this._getChatClient(message.from)
            const messageCase = this._getCase(current_client, message_to_case)
            switch (messageCase){
                
                case "CASE_ATTENDANT":
                    const client_message = "Entrando em contato com vendedoras... Agradeço sua atenção."
                    const attendants_message = `O número ${message.from} precisa de atendimento. Favor entrar em contato.`
                    this.client.sendText(message.from, client_message)
                    .then(result => {this._removeClientFromList(message.from)})
                    .catch(err => console.log(err))
                    this.client.sendText('553788337552@c.us', attendants_message)
                    .catch(err => {console.log(err)})
                    break
                
                case "CASE_END_OF_CHAT":
                    const end_message = `Agradecemos sua atenção. Se desejar falar com uma vendedora envie \"Falar com atendente\".`
                    this.client.sendText(message.from, end_message)
                    .then(result => {this._removeClientFromList(message.from)})
                    .catch(err => console.log(err))
                    break
                
                
                case "CASE_1":
                    this.client.sendText(message.from, this.botAnswers.MESSAGE_1)
                    .then(result => {
                        const newDate = new Date()
                        const today = newDate.getTime()
                        if (current_client.length) {
                            const clientIndex = this._getClientIndex(message.from)
                            this.c_messages[clientIndex].current_cv =  "CASE_2"
                            this.c_messages[clientIndex].timestamp = today
                            return
                        }
                        const newClient = { 
                            phone_number: message.from, 
                            current_cv: 'CASE_2', 
                            timestamp: today} as CurrentClients
                        this.c_messages.push(newClient)
                    })
                    .catch(err => console.log(err))
                    break

                case "CASE_2_POSITIVE":
                    this.client.sendText(message.from, this.botAnswers.MESSAGE_2_POSITIVE)
                    .then(async (result) => {
                        const clientIndex = this._getClientIndex(message.from)
                        this.c_messages[clientIndex].current_cv = "CASE_3"
                    })
                    .catch(err => console.log(err))
                    break 
            
                case "CASE_2_NEGATIVE":
                    this.client.sendText('553788337552@c.us', `O número ${message.from} precisa de atendimento. Favor entrar em contato.`)
                    .catch(err => console.log(err))
                    this.client.sendText(message.from, this.botAnswers.MESSAGE_2_NEGATIVE)
                    .then(result => {
                        this._removeClientFromList(message.from)
                    })
                    .catch(err => console.log(err))
                    break

                case "CASE_2_RANDOM":
                    this.client.sendText(message.from, this.botAnswers.MESSAGE_2_RANDOM)
                    .catch(err => console.log(err))
                    break   

                case "CASE_3":
                    const cnpj_treated = this._treatMessage(message.body)
                    const [cnpj_data, cnpj_condition] : CheckCnpjData = await this._checkCNPJ(cnpj_treated)
                    const city_treated = this._treatMessage(`${cnpj_data.municipio}${cnpj_data.uf}`)
                    switch (cnpj_condition) {
                        case 'CNPJ_TRUE':
                            if (this.forbidden_citys.includes(city_treated)) {
                                this.client.sendText(
                                    message.from, 
                                    this.botAnswers.MESSAGE_3_FORBIDDEN_CITY(`${cnpj_data.municipio}-${cnpj_data.uf}`))
                                .then(result => {
                                    this._removeClientFromList(message.from)
                                })                            
                                .catch(err => console.log(err))
                                break
                            }
                            
                            this.client.sendText(
                                message.from, 
                                this.botAnswers.MESSAGE_3_CNPJ_TRUE(this._treatClientName(cnpj_data.nome)))
                            .then(result => {
                                this._removeClientFromList(message.from)
                            })                            
                            .catch(err => console.log(err))
                            break
                        
                        case 'CNPJ_FALSE':
                            this.client.sendText(message.from, this.botAnswers.MESSAGE_3_CNPJ_FALSE)
                            .then(result => {
                                this._removeClientFromList(message.from)
                            })                            
                            .catch(err => console.log(err))
                            break
                        
                        case 'CNPJ_BAIXADO': 
                            this.client.sendText(message.from, this.botAnswers.MESSAGE_3_CLIENT_INATIVE(cnpj_data.situacao))
                            .then(result => {
                                this._removeClientFromList(message.from)
                            })                            
                            .catch(err => console.log(err))
                            break
                        
                        case 'NOT_FOUND':
                            this.client.sendText(message.from, this.botAnswers.MESSAGE_3_NOT_FOUND)            
                            .catch(err => console.log(err))
                            break
                        
                    }
            }   
        })
    }
}

