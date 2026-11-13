# Migração para as contas do projeto (Google + GitHub)

Objetivo: tirar o Buy Off da conta pessoal e colocar em contas que pertencem ao projeto,
para que ele continue funcionando se alguém sair ou mudar de função.

Tempo estimado: 1 a 2 horas. Faça num horário sem lançamentos (ex.: depois do turno).

---

## 0. Antes de começar

- [ ] Escolha um nome neutro para as contas, sem nome de pessoa (ex.: `buyoff.pintura.ornare`).
- [ ] Defina onde a senha fica guardada e **quem mais tem acesso** (o gestor, no mínimo).
- [ ] A verificação em duas etapas deve usar um **celular da empresa** ou um e-mail
      corporativo de recuperação, não o seu celular pessoal. Senão o problema volta.

## 1. Conta Google nova

1. Crie a conta Gmail do projeto e ative a verificação em duas etapas.
2. Na conta **antiga**, compartilhe com a conta nova (como Editor):
   - a planilha atual do Buy Off;
   - a pasta do Drive **"Buy Off - Fotos"**.

## 2. Planilha e servidor na conta nova

Recomendado: criar tudo do zero na conta nova e só copiar o histórico. Assim as chaves,
a pasta de fotos e a implantação ficam 100% na conta nova.

1. Na conta nova, crie uma planilha em branco (ex.: "Buy Off - Pintura").
2. **Extensões > Apps Script**: apague o código padrão, cole o `Code.gs` deste
   repositório e salve.
3. Rode a função **`setup()`** e autorize. Ela cria a aba, a pasta de fotos privada
   e **chaves novas**. Anote as chaves que aparecem no registro (ou rode `mostrarChaves()`).
4. **Implantar > Nova implantação > App da Web**
   - Executar como: **Eu** (a conta nova)
   - Quem pode acessar: **Qualquer pessoa**
5. Copie a URL que termina em `/exec`.

### Copiar o histórico
1. Abra a planilha antiga (que está compartilhada com a conta nova).
2. Clique com o botão direito na aba **"Lançamentos IBOTIC"** > **Copiar para >
   Planilha existente** > escolha a planilha nova. Faça o mesmo com a aba antiga
   **"Lançamentos"**, se quiser manter esse histórico.
3. Na planilha nova, apague a aba vazia "Lançamentos IBOTIC" criada pelo `setup()`
   e renomeie a cópia ("Cópia de Lançamentos IBOTIC") para **"Lançamentos IBOTIC"**.
4. Apague a linha de teste com observação imprópria (pendência antiga).

> Fotos antigas: os links das linhas copiadas continuam apontando para a pasta da conta
> antiga. Como ela está compartilhada com a conta nova, os links continuam abrindo.
> Se a conta antiga for fechada um dia, mova antes essas fotos para o Drive da conta nova.

## 3. Conta GitHub nova

1. Crie a conta GitHub do projeto usando o Gmail novo. Ative a verificação em duas etapas.
2. Na conta **antiga**, transfira o repositório (mantém todo o histórico):
   `apontamento-buyoff` > **Settings** > **General** > *Danger Zone* >
   **Transfer ownership** > digite o usuário novo. Aceite o convite no e-mail da conta nova.
   - Alternativa: na conta nova, criar um repositório `apontamento-buyoff` público e
     enviar os arquivos `index.html`, `app.js`, `Code.gs`, `README.md` e este arquivo.
3. Na conta nova: **Settings > Pages** > Source: *Deploy from a branch* > `main` / `(root)`.
4. O novo endereço será `https://USUARIO-NOVO.github.io/apontamento-buyoff/`.
   **O endereço antigo não redireciona**, então os QR codes antigos param de abrir o site.

## 4. Ligar o site ao servidor novo

1. No `app.js`, troque a URL da linha `var ENDPOINT = '...'` pela URL `/exec` do passo 2.
2. No `index.html`, aumente o número em `app.js?v=5` (ex.: `v=6`) para os celulares
   baixarem o arquivo novo.
3. Commit na `main`. Em 1 a 2 minutos o site atualiza.

## 5. QR codes novos e teste

1. Abra o site novo, vá na aba **Controle**, entre com a **CHAVE_CONTROLE nova** e
   gere o link/QR com a **CHAVE_LANCAMENTO nova**.
2. Faça um lançamento de teste pelo celular (com e sem foto) e confira a linha na
   planilha nova e a foto na pasta nova. Depois apague a linha de teste.
3. Imprima o QR novo e troque os QR codes colados nas máquinas.
   Basta o operador ler o QR novo uma vez: a chave nova substitui a antiga no aparelho.

## 6. Desligar o sistema antigo

Só depois que o teste do passo 5 funcionar:

1. Na conta antiga, no Apps Script: **Implantar > Gerenciar implantações >**
   arquivar a implantação. A partir daí a URL antiga não aceita mais lançamentos.
2. Na conta antiga, rode `trocarChaves()` (por garantia, as chaves antigas deixam de valer).
3. Mantenha a planilha antiga como backup por algumas semanas.
4. Se o repositório foi recriado em vez de transferido, apague ou arquive o antigo.

## 7. Depois da migração

- [ ] Gestor (ou outra pessoa) com acesso às duas contas novas.
- [ ] Atualizar o `CONTEXTO.md` com os novos endereços (sem colar chaves nele).
- [ ] Confirmar com a TI que a rede da fábrica libera `github.io`,
      `script.google.com` e `script.googleusercontent.com` (não muda com a migração).
