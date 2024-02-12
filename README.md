# Metal on Symbol

## V2 リリースノート

- **ペイロードがこれまで Base64 だったものがバイナリになります。** その結果、容量効率が改善します。 
  バイナリ Value の Metadata を扱うために Symbol SDK (v2) に独自拡張を施しています (SDK に同梱)
- ヘッダー領域を削減しペイロード領域を 1 チャンク 1012 バイトに拡張。
  - magic を　1 バイト文字から 1 ビット、version を 3 バイトから 1 バイトに縮小し、途中にリザーブ 7 ビット挟んで 2 バイトに格納。
  - additive を 4 バイト文字列から 16 bits unsigned int（0～65535）に。
  - Metadata key を 16 バイト Hex 表現だったのを 64 bits unsigned int（8バイト）に。
- CLI / SDK は V1 の Metal を自動的に認識してデコードします。V1 の Metal を Forge することはできません。
  - ただし、V1 の SDK (`MetalService`) と `scrap`, `reinforce` CLI を `compat` フォルダに退避してありますので、
    任意に呼び出すことは可能です(CLI では `scrap-v1`, `reinforce-v1` で呼び出し可能）

### SDK V1 → V2 マイグレーション手順

1. `MetalService` クラスを `MetalServiceV2` クラスに置換。メソッドは同じ物が生えてます。<br />
   ※旧クラス `MetalService` は [/src/services/compat](./src/services/compat) にあります。
2. 各メソッドの変更点に対応。いずれもエディタの型チェック機能や、TS のトランスパイル時にエラーが出ると思います。
   JavaScript から使用する際は注意していください。
   - 引数の `additive` の型を `number` (0 ～ 65535) に変更する。
     - `verifyMetadataKey()` メソッド
     - `createForgeTxs()` メソッド
     - `createDestroyTxs()` メソッド
   - 引数の `Metadata` は `BinMetadata` に変更する。
     - `decode()` メソッド
     - `createScrapTxs()` メソッド
     - `createDestroyTxs()` メソッド
     - `checkCollision()` メソッド
     - `verify()` メソッド
   - 引数の `MetadataEntry` は `BinMetadataEntry` に変更する。
     - `extractChunk()` メソッド
   - 戻り値の `additive` の型は `number` (0 ～ 65535) になります。
     - `extractChunk()` メソッド
     - `createForgeTxs()` メソッド
   - 戻り値の `Metadata` は `BinMetadata` になります。
     - `getFirstChunk()` メソッド
   - `decode()` の戻り値は `Uint8array` （バイナリ）になります。Base64 のデコードは不要です。
3. Symbol SDK (v2) の `Metadata` クラスを `BinMetadata` クラスに置換。以下の関連クラスも置換する。
   - `MetadataHttp` → `BinMetadataHttp`
   - `MetadataRepository` → `BinMetadataRepository`<br />
     **※`RepositoryFactory` は使用できないので注意**
   - `MetadataEntry` → `BinMetadataEntry`
4. `SymbolService` の `searchMetadata()` メソッドを使用している場合は、`searchBinMetadata()` メソッドに変更
5. V1 Metal のデコードは `MetalServiceV2` クラスでも可能です（内部でチャンクバージョンを判別して処理します）

## 1. 概要

### 1.1. Metal とは

Metal（メタル）とは Symbol ブロックチェーンに、任意の（サイズの）データを書き込んだり読み込んだりするためのプロトコルです。
簡単に言えば、Symbol ブロックチェーンをオンラインの不揮発性メモリ（ROM）として使用できます。

Metal をブロックチェーンに書き込むと、場所を特定するための一意な `Metal ID` が決まり、
以降はこの `Metal ID` でデータを取り出せます。

ブロックチェーンは一度書き込んだデータは消したり書き換えたりできませんが、**Metal は削除できます**。
Metal を削除すると、単に `Metal ID` でのデータ取り出しができなくなります。

> 正確にはトランザクションをスキャンすればデータを取り出せるかもしれませんが、いずれにせよ直感的にはできなくなります。

大事なことなので最初に書いておきますが、データを書き込んだり **削除したり** する際はデータ容量に応じた **トランザクション手数料** が掛かります。
これは Metal の基盤となる Symbol ブロックチェーンネットワークを維持するインセンティブとなります。

要するに、Metal は Symbol ブロックチェーンの「メタデータ」に任意のデータを書き込むためのシンプルなプロトコルです。

### 1.2. 開発の動機

NFTと関係なく、アプリの要求により、単純にブロックチェーンで任意サイズのデータを入れたり取り出したりしたかったので開発しました。

> Metal ではトークンを発行しないので NFT とは直接関係ありませんが、NFT のコンテンツストレージとしても使えます。

### 1.3. Symbol のメタデータとは

Symbol のメタデータは「アカウント」「モザイク」「ネームスペース」に付与できる追加情報領域で、
Metal はこれら全てにおいて使用可能です。

メタデータの付与数に上限は特にありません。

一つのメタデータでは最大 1,024 bytes のデータを格納できます（パブリックチェーン設定の場合）

メタデータのユニークIDを決定する為に必要な情報は以下の通りです。

- Type: メタデータタイプ（Account, Mosaic, Namespace）
- Source Address: 誰が付与するか、アカウントのアドレス
- Target Address: 誰に付与するか、アカウントのアドレス
- Target ID: 何に付与するか（Mosaic ID, Namespace ID, Account の場合は `0000000000000000`）
- Key: 64 bits unsigned int 値

これらの情報から 256 bits の `Metadata Composite Hash` が計算でき、
以降は `Metadata Composite Hash` で直接メタデータへアクセスが可能です。

メタデータは差分を後から書き込むことで現在値を変化させられます。
また、データを打ち消すような差分を書き込むと現在値を無にできます。

いずれも実際にデータがブロックチェーン上から消えたり書き変わったりした訳ではなく、
トークンの残高と同様に、履歴を辿った結果、現在値が変化する物です。

### 1.4. Metal の世界観

- データを Metal 化してブロックチェーンにアップロードすることを **Forge（フォージ／鍛造）** と呼びます。
- Metal を削除することを **Scrap（スクラップ／廃棄）** と呼びます。
  Scrap された Metal は `Metal ID` でアクセスできない文字通りの「くず鉄」になります。
- マルチシグを使用して Metal を Forge または Scrap することを **Reinforce（レインフォース／補強）** と呼びます。
- `Metal ID` の先頭は `Fe` で始まります。

### 1.5. Metal の技術的性質

#### Pros

- Metal はプロトコルなので、動作に必要な中央集権サーバーやアカウントが存在しません。
- `Metal ID` だけで完全にデータの位置を特定できます。
- `Metal ID` は再現性があります（ランダム生成ではありません）
  IPFS の様にデータの内容が変わると `Metal ID` も変わります。
- Metal は Scrap するとアカウント・モザイク・ネームスペースに存在しなくなり、`Metal ID` でアクセスも出来なくなります。
- アカウント、モザイク、ネームスペースに Forge 可能です。
- メタデータなので、プロトコル外で改変される可能性がありますが、プロトコル内で検出可能です。
- マルチシグで永続性を強化できます。
- Forge や Scrap のトランザクションは耐障害性があり、差分補完が可能です。
- TOC（Table Of Contents）を持たず、単方向リストで構成されます。手数料を無視すれば任意サイズのデータを Forge できます。

#### Cons

- ~~Forge する際はデータを base64 に変換し、細かくチャンクに分けて書き込みますので、容量効率は**すこぶる良くありません**。
  ヘッダーを除くとチャンク一つは base64 での 1,000 文字まで（正味 750 バイト位？）~~
- トランザクションデータとメタデータの現在値が全ノードに（恐らく）保持される為、冗長になります。
- Scrap は Forge と同ボリュームのトランザクションデータを要します。手数料も Forge と同じだけかかります。 
- ファイル情報（ファイル名、形式、サイズ、タイムスタンプ等）を取り扱いません。
- プロトコルレベルでは暗号化を行いません。
- アカウント作成や、モザイク作成、ネームスペース作成はプロトコルに含まれません。
- 空データは Forge できません。

### 1.6. Metal の手数料

Metal はオープンプロトコルなので Metal 自体の利用料はないですが、
ネットワークに対して支払われる、データ容量に応じたトランザクション手数料がかかります。

料率の設定（トランザクション実行者が設定できる）にもよりますが、大体数百 K bytes つき、数十 XYM のオーダーでかかります。

トランザクションは Forge の時はもちろんの事、**削除する Scrap 時も Forge と同じボリュームのトランザクションが発生するため、
ほぼ同じ額のトランザクション手数料がかかります。**

本番 Forge 前に手数料額の見積が出来ますので、`-e` (Estimate) オプションを利用してください。

## 2. CLI の使い方

本 CLI は Metal プロトコルのリファレンス実装となるものです。

### 2.1. 前準備

#### インストール

```shell
npm install -g metal-on-symbol
```

#### 環境変数でノードを設定

予め環境変数 `NODE_URL` に使用するノードURLを設定してください（`--node-url` オプションでも指定できます）

メインネットはもちろん、テストネットのノードも指定可能です。

**Windows**

```shell
set NODE_URL=https://example.jp:3001
```

**Unix-like**

```shell
export NODE_URL=https://example.jp:3001
```

### 2.2. （大体）共通のオプション

#### ・`--node-url node_url`

（全共通）Symbol ノードの URL を指定します。

同様の設定を行う環境変数 `NODE_URL` より優先されます。

#### ・`--priv-key private_key`

（全共通）アカウントのプライベートキーを指定します。

同様の設定を行う環境変数 `SIGNER_PRIVATE_KEY` より優先されます。

> トランザクションに署名するアカウントは常にこちらになります。

#### ・`--parallels 整数(1～)`

（Forge / Scrap / Reinforce）トランザクションアナウンス（実行）の並列数。
増やすとより効率よく処理されますが、ノードから弾かれる可能性が高まります。
デフォルトは `10` です。

ノードから切られる場合は、逆に数値を減らしてください。

#### ・`--fee-ratio 数値(0.0～1.0)`

（Forge / Scrap）0.0 から 1.0 の間の数値で手数料率を指定します。
0.0 はウォレットでいうところの「最遅」1.0 は「早い」です。
デフォルトは `0.35` です。

同様の設定を行う環境変数 `FEE_RATIO` より優先されます。

#### ・`-f` または `--force`

（Fetch / Forge / Scrap / Reinforce）確認や入力のプロンプトを表示しない。

### 2.3. Forge（アップロード）

> `metal forge -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal forge [options] input_path
```

#### A. アカウントに Forge する例

```shell
metal forge  test_data/e92m3.jpg
```

アカウントのプライベートキーを聞かれるので入力してください。
該当するアカウントに対して Forge されます。

> プライベートキーは `--priv-key` オプションまたは `SIGNER_PRIVATE_KEY` 環境変数でも指定可能です。

トランザクション数と手数料が表示されるので、`y` を入力するか Enter キーを押すと、
トランザクションのアナウンス（実行）が始まります。

最後までエラーなく `Summary of Forging` が表示されれば完了です。
尚、`Metal ID` が Metal にアクセスするための ID となりますので、アカウントのアドレスは不要です。

#### B. モザイクに Forge する例

```shell
metal forge  -m mosaic_id  test_data/e92m3.jpg
```

アカウントのプライベートキーを聞かれるので入力してください。
`mosaic_id` で指定したモザイクに Forge されます。
この場合、自分がモザイク作成者である必要があります。

`mosaic_id` を知らなくても、`Metal ID` だけで Metal にアクセス可能です。

#### C. ネームスペースに Forge する例

```shell
metal forge  -n namespace.name  test_data/e92m3.jpg
```

アカウントのプライベートキーを聞かれるので入力してください。
`namespace.name` で指定したネームスペースに Forge されます。
この場合、自分がネームスペース所有者である必要があります。

`namespace.name` を知らなくても、`Metal ID` だけで Metal にアクセス可能です。

#### その他のオプション例

##### 見積だけ実行

`-e` (Estimate) オプションを付けることで、トランザクションを実行せずに、見積だけ行います。

尚、表示される `Metal ID` は本番と同じものです。

```shell
metal forge  -e  test_data/e92m3.jpg                     # Account Metal
metal forge  -e  -m mosaic_id  test_data/e92m3.jpg       # Mosaic Metal
metal forge  -e  -n namespace.name  test_data/e92m3.jpg  # Namespace Metal
```

##### 差分だけ（途中で失敗した場合）

`-r` (Recover) オプションを使うと、差分のチャンクだけアナウンスして Metal を補完することができます。

```shell
metal forge  -r  test_data/e92m3.jpg                     # Account Metal
metal forge  -r  -m mosaic_id  test_data/e92m3.jpg       # Mosaic Metal
metal forge  -r  -n namespace.name  test_data/e92m3.jpg  # Namespace Metal
```

### 2.4. Fetch（ダウンロード）

> `metal fetch -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal fetch [options] metal_id
```

`metal_id` で特定される Metal を取得し、ファイルにダウンロードします。
オプションを何も指定しないと標準出力（通常はコンソール画面）にデータが出力されます。
プロトコル的に、ファイル名は Metal へ保存されないからです。

出力に名前を付けてファイル保存したい場合は、

```shell
metal fetch  -o output_path  metal_id
```

上記の `output_path` に出力ファイルパスを入れてください。

### 2.5. Verify（照合）

> `metal verify -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal verify [options] metal_id input_path
```

`metal_id` で特定される Metal と、`input_path` で指定されるファイルとを比較します。

エラーなく `Verify succeeded` と表示されれば成功です。

### 2.6. Scrap（廃棄）

> `metal scrap -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal scrap [options] metal_id
```

`metal_id` で特定される Metal を削除します。

アカウントのプライベートキーを聞かれるので入力してください。

> プライベートキーは `--priv-key` オプションまたは `SIGNER_PRIVATE_KEY` 環境変数でも指定可能です。

トランザクション数と手数料が表示されるので、`y` を入力するか Enter キーを押すと、
トランザクションのアナウンス（実行）が始まります。

最後までエラーなく `Summary of Scrapping` が表示されれば完了です。

同じ `metal_id` で Fetch して、取得できないことを確認してください。

#### その他のオプション例

##### 中途半端に壊れた Metal を Scrap にする

中途半端に壊れてチャンクが辿れなくなった Metal を完全に Scrap にしたい場合は、
`-i input_path` オプションを使用して元ファイル指定してください。

この場合、metal_id はファイルから計算できるので、指定する必要はありません。

```shell
metal scrap  -i test_data/e92m3.jpg                     # Account Metal
metal scrap  -i test_data/e92m3.jpg  -m mosaic_id       # Mosaic Metal
metal scrap  -i test_data/e92m3.jpg  -n namespace_name  # Namespace Metal
```

**Additiveが添加された Metal の場合**

Forge する際、デフォルト（0）とは異なる Additive が添加されている場合は、
以下のように `--additive` オプションを指定してください。

```shell
metal scrap  -i test_data/e92m3.jpg  --additive 1234                     # Account Metal
metal scrap  -i test_data/e92m3.jpg  --additive 1234  -m mosaic_id       # Mosaic Metal
metal scrap  -i test_data/e92m3.jpg  --additive 1234  -n namespace_name  # Namespace Metal
```

### 2.7. Reinforce（マルチシグの連署）

Forge または Scrap する際に、マルチシグアカウントからの実行や、Metal の発行元（ソース）と作成先（ターゲット）が異なる場合、
Reinforce を使って連署を行います。

> 必要なプライベートキーがそろっている場合は Forge や Scrap に `--cosigner` オプションを付けて必要なプライベートキーを指定することで、
> Reinforce を使わなくても最初から連署を行うことが可能です。
> `--cosigner` は複数回指定できます。

#### 手順1: Forge または Scrap の時に、JSON ファイルを出力する

`-o` (Output intermediate) オプションを使うと、連署前の中間トランザクションを JSON ファイルに出力できます。

自分とは違うアカウントに Metal を Forge する場合を例に挙げます。

```shell
metal forge  -e  -o intermediate.json  -t someones_public_key  test_data/e92m3.jpg
```

> `-e` オプションでアナウンスしないように明示していますが、オプションが無くても連署が足りない場合はアナウンスできません。

自分から、`someones_public_key` で指定される別のアカウントに Forge します。この場合、相手方の連署が必要になります。

トランザクションが実行される代わりに `intermediate.json` に中間トランザクションが出力されます。

#### 手順2: reinforce で連署

元のファイル `test_data/e92m3.jpg` と、中間トランザクションファイル `intermediate.json` を相手に送付し、
相手側で以下のように Reinforce を実行します。

```shell
metal reinforce  -a  intermediate.json  test_data/e92m3.jpg
```

> ここでは `-a` (Announce) オプションを付けないとトランザクションが実行されません。

元のファイルを指定するのは、`intermediate.json` に悪意のある破壊的なトランザクションが混在されている可能性があり、
実行前に必ず `intermediate.json` の内容と元ファイルの内容を照合するためです。

アカウントのプライベートキーを聞かれるので入力してください。

> プライベートキーは `--priv-key` オプションまたは `SIGNER_PRIVATE_KEY` 環境変数でも指定可能です。

トランザクション数と手数料が表示されるので、`y` を入力するか Enter キーを押すと、
トランザクションのアナウンス（実行）が始まります。

最後までエラーなく `Summary of Reinforcement` が表示されれば完了です。

尚、手数料は Forge を開始したアカウントが支払います。
**Reinforce で後から手数料が追加されることはありません。**

> `--cosigner` オプションを使うことで、一度に複数のプライベートキーで連署できます。

> #### 中間トランザクションファイルの有効期限
> 
> 中間トランザクションファイルはデフォルトで Forge の開始から `5 時間` の有効期限が存在します。
> この期限内に全ての連署を集める必要があります。
> 有効期限を過ぎると実行してもエラーとなります。
> 
> 有効期限を5時間を超えて設定したい場合は、
> forge or scrap に `--deadline hours` オプションを使用してください（48時間にする例: `--deadline 48`）

#### 手順3: 更に連署が必要な場合

更に連署者がいる場合は、Reinforce の `-o` (Output intermediate) オプションで更に中間トランザクションファイルを作成します。

```shell
metal reinforce  -o intermediate-new.json  intermediate-old.json  test/e92m3.jpg
```

再び元のファイル `test_data/e92m3.jpg` と、新たな中間トランザクションファイル `intermediate-new.json` を相手に送付し、
同じように Reinforce を実行してもらいます。
これを必要な数だけ繰り返し、最後の人は、`-o intermediate-new.json` オプションの代わりに `-a` オプションを付けて実行することで
Forge または Scrap が完了します。

```shell
metal reinforce  -a  intermediate-final.json  test/e92m3.jpg
```

または、最後の人も中間トランザクションファイルを作成して Forge を開始した人に送り、上記コマンドを実行してもらうこともできます。
その場合は、プライベートキーの入力プロンプトで Enter キーを押して入力をスキップしてください。
それ以上の連署は行わずトランザクションのアナウンス（実行）だけします。

> #### つ「アグボン」
> 
> データサイズによっては連署が必要なトランザクション数が百オーダーになる場合もあるので、
> Metal で Aggregate Bonded を使うことは現実的でないですが、
> 技術的には実装可能だと思います（ウォレットに、Aggregate Bonded への連署を自動化する機能追加など）

### 2.8. ペイロードの暗号化

Metal はプロトコルレベルでの暗号化をサポートしませんが、
Metal CLI にはペイロードを暗号化及び復号化するためのユーティリティコマンドが用意されています。

Metal CLI による暗号化は、今のところ転送トランザクションメッセージの暗号化を流用して行われます。
これは差出人と受取人が一対一で固定される方式です。

> Metal はペイロードのデータ形式を関知しないので、
> 暗号化に限らず、どの様な形式でもペイロードをエンコード・デコードできます
> （全て、受取人がデコード手段を知っている前提です）

#### ・暗号化

> `metal encrypt -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal encrypt [options] [input_path]
```

暗号化してファイルに出力するには以下のように実行してください。

```shell
metal encrypt  -o encrypted.out  test_data/e92m3.jpg
```

プライベートキーが聞かれるので入力してください。差出人・受取人共に自分で暗号化され、
`encrypted.out`（実際のファイル名はなんでも良いです）に出力されます。

受取人を自分以外にしたい場合は、

```shell
metal encrypt  --to someones_public_key  -o encrypted.out  test_data/e92m3.jpg
```

上記のように `--to someones_public_key` で受取人のパブリックキーを指定してください。

Metal のペイロードを暗号化したい場合は、上記の出力 `encrypted.out` を元に Forge してください。

Encrypt コマンドは `-o` オプションを指定しないと、標準出力へ暗号文を出力します。
以下はこれを利用して、Forge まで一気にやってしまう方法です。
尚、Forge コマンドも入力ファイルを指定しない場合は標準入力からデータを取り込みます。

```shell
metal encrypt  --priv-key your_private_key  --to someones_public_key  test_data/e92m3.jpg  |  metal forge  --priv-key your_privatge_key
```

> 確認ダイアログも表示されず、アナウンスまでノンストップで行われることに注意してください。
> 手数料の確認だけを行うには `forge` に `-e` オプションを付けてください。

受取人がデータを復号化するには、受取人自身のプライベートキーと **差出人のパブリックキー** が必要になります。
相手には Metal ID の他に自身のパブリックキーを伝達しましょう。

**暗号化したペイロードで Forge すると、以降、「元ファイル」はすべて暗号化後の物を指すことに注意してください。**

#### ・復号化

> `metal decrypt -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal decrypt [options] [input_path]
```

暗号化されたデータを復号化してファイルに出力するには以下のように実行してください。

```shell
metal decrypt  -o plain.out  encrypted.out
```

プライベートキーが聞かれるので入力してください。差出人・受取人共に自分で復号化され、
`plain.out`（実際のファイル名はなんでも良いです）に出力されます。

差出人が自分以外である場合は、

```shell
metal decrypt  --from someones_public_key  -o plain.out  encrypted.out
```

上記のように `--from someones_public_key` で差出人のパブリックキーを指定してください。
パブリックキーは差出人より送付してもらってください。

Decrypt コマンドは入力ファイルを指定しないと標準入力からデータを取り込みます。
これを利用して Fetch から復号まで一気にやってしまう方法です。
尚、Fetch コマンドも `-o` オプションで出力ファイルを指定しない場合、標準出力へデータを吐き出します。

```shell
metal fetch  metal_id  |  metal decrypt  --from someones_public_key  --priv-key your_private_key  -o plain.out
```

## 3. （開発者向け）ビルド

git でリポジトリをクローンしてディレクトリに移動

```shell
git clone https://github.com/OPENSPHERE-Inc/metal-on-symbol
cd metal-on-symbol
```

**yarn**

```shell
yarn
yarn build
```

**npm（以後省略）**

```shell
npm install
npm run build
```

以下、コマンドの前に `run` を付ければ npm で代用できます。


## 4. （開発者向け）単体テスト

単体テストと言いつつも、ブロックチェーンにアクセスします。

まず、実行する前に `dot.env.test` を `.env.test` にリネームして内容を書き換えてください。

```
NODE_URL=https://your.node.url.here:3001

SIGNER1_PRIVATE_KEY=Your account's private_key here
PAYER_PRIVATE_KEY=Your another account's private_key here

TEST_INPUT_FILE=Test file_path here. (DO NOT use a file that contains personal info)
TEST_OUTPUT_FILE=Test file_path here. (The path might be overwritten)
BATCH_SIZE=100
FEE_RATIO=0.35
MAX_PARALLELS=10
```

```shell
yarn test
```

## 5. プロトコル仕様

### 5.1. Metal ID

**例:** `FeFTSBHsVZANTbsEFYZWf97bJLdb6gGGG6eUrRaGMcd9ow`

`Metal ID` は base58 でエンコードされます（[bs58](https://www.npmjs.com/package/bs58) を使用）
以下は base58 エンコード前の生バイト列です。

先頭の 2 bytes は単なるオーナメントです。

| 2 bytes   | 32 bytes                                               |
|-----------|--------------------------------------------------------|
| 0x0B 0x2A | `Metadata Composite Hash`（* 8 bits unsigned int array） |

(*) `Metadata Composite Hash` は、HEX 表現を 2 バイトずつ 8 bits unsigned int に変換した配列です。

サンプルコード

```typescript
const METAL_ID_HEADER_HEX = "0B2A";

const calculateMetalId = (
    type: MetadataType,
    sourceAddress: Address,
    targetAddress: Address,
    targetId: undefined | MosaicId | NamespaceId,
    scopedMetadataKey: UInt64,
) => {
    const compositeHash = calculateMetadataHash(
        type,
        sourceAddress,
        targetAddress,
        targetId,
        scopedMetadataKey
    );
    const hashBytes = Convert.hexToUint8(METAL_ID_HEADER_HEX + compositeHash);
    return bs58.encode(hashBytes);
};

const restoreMetadataHash = (
    metalId: string
) => {
    const hashHex = Convert.uint8ToHex(
        bs58.decode(metalId)
    );
    if (!hashHex.startsWith(METAL_ID_HEADER_HEX)) {
        throw Error("Invalid metal ID.");
    }
    return hashHex.slice(METAL_ID_HEADER_HEX.length);
};
```

#### Metadata Composite Hash について

**例:** `D3E8D04BE5D13FCBCB990A186F0E5017C20BB20FFAB93DAF6B30531D77972952`

`Metadata Composite Hash` はメタデータの
「ソースアドレス」「ターゲットアドレス」「メタデータキー」「ターゲットID（Mosaic ID, Namespace ID）」「タイプ」
を sha3_256 でハッシュ化した 256 bits のハッシュ値です。
上記はそれを HEX 表現にしたもので、トランザクションハッシュと同様の 64 bytes の文字列になります。

`Metal ID` では、先頭チャンクのメタデータについて、この `Metadata Composite Hash` 値を計算して使用します。

Symbol SDK には計算用のコードが入っていませんが、以下のコードで計算可能です。

> これは Metal 特有の仕様ではなく Symbol の仕様です。これを変えるとメタデータにアクセスできなくなります。

```typescript
const calculateMetadataHash = (
    type: MetadataType,
    sourceAddress: Address,
    targetAddress: Address,
    targetId: undefined | MosaicId | NamespaceId,
    key: UInt64,
) => {
    const hasher = sha3_256.create()
    hasher.update(sourceAddress.encodeUnresolvedAddress());
    hasher.update(targetAddress.encodeUnresolvedAddress());
    hasher.update(Convert.hexToUint8Reverse(key.toHex()));
    hasher.update(Convert.hexToUint8Reverse(targetId?.toHex() || "0000000000000000"))
    hasher.update(Convert.numberToUint8Array(type, 1));
    return hasher.hex().toUpperCase();
};
```

### 5.2. チャンクメタデータ

#### 5.2.1. メタデータの Value

**例** 

・Chunk (Additive = 0)

```
0031000001756675E5C78815FFD8FFE000104A46494600010101006000600000FFE100224578696600004D4D002A00000008000101120003000000010001000000000000FFDB0043000201010201010202020202020202030503030303030604040305070607070706070708090B0908080A0807070A0D0A0A0B0C0C0C0C07090E0F0D0C0E0B0C0C0CFFDB004301020202030303060303060C0807080C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0C0CFFC000110800FA032003012200021101031101FFC4001F0000010501010101010100000000000000000102030405060708090A0BFFC400B5100002010303020403050504040000017D01020300041105122131410613516107227114328191A1082342B1C11552D1F02433627282090A161718191A25262728292A3435363738393A434445464748494A535455565758595A636465666768696A737475767778797A838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE1E2E3E4E5E6E7E8E9EAF1F2F3F4F5F6F7F8F9FAFFC4001F0100030101010101010101010000000000000102030405060708090A0BFFC400B51100020102040403040705040400010277000102031104052131061241510761711322328108144291A1B1C109233352F0156272D10A162434E125F11718191A262728292A35363738393A434445464748494A535455565758595A636465666768696A737475767778797A82838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE2E3E4E5E6E7E8E9EAF2F3F4F5F6F7F8F9FAFFDA000C03010002110311003F00FAD352D0BFB5BC0F67F0FF0050B8D6AF7C7234EF22D2D756D61EDEFEE1ADE5DCCCC90EA416E2389E489A3631DD12AA1B6C9B4D725F153C4D6FFD97A7C9368BA7F8BB54B312C515DDB6AAB3DE685036D12442D24649B50453E629572CE5189825FDE4D28F158340BCFDA02F26F1A6B1E28F036B1E32B96825BDD47C273DCEA412ED5C20B093518A07B1B3458A78A3C9B8795545C4ACCDBDE43EB9F0A7C0FE209BE2978735AB8D5BC65E2EF0DF8A9219FC469E1EB1FECBB513CFE6C205C34375736F70EA0C5E5B35E876F2E011ACE656497F11A98574D4B9DF37975EAFA7EA7EA5529A6FDA4E4DFF00497E3D0F3CF897A7687F043C39E209F50D27C3BA1C89FE87E1FD02F354D61A148D62C496E62D2EDAE6096333CAD6F35B4CE77850FF00686511E3A0FD9FBF634F117ECA7A1789B568FF00B67C51A0EA9773EB12B5DA5A6A5A5E84CE05B2AC082D7CF92F6290C9970F16D8DFF7508C36FEA747F1DCFF000F3C67
```

・End Chunk (Additive = 0)

```
803100009AF02A462D4D71B7DA78ABC03E32BD49E6B959FF00D0F49672565951D46D8E3752C4E0AAF9A43B946243E97C4AD1ACEEF5C5D426B5B692FADEEB51F2AE5E2569A3C5BDB01B5F1918048E0F73EB5E73FB1CEBD7DE27F8DBE0BD0F52BCBBD43459F5C29269F73334D6B228D8A0189895202F0011D38AF4631528DA5AA3C6AD374AADA9E96668F8BBE28E9FA378B74C5F0E6A8969A979F729A68BBB0D2EEAC4C533992EEDDAE229E349ED5A26CC703C48ED22F9691AB9491FD6FC5965A3F813C456FAA7847C37E1BF1442D323CDE1BBAD2A69E47B864575F2EDA0CBC3033798BB9F7229752A2274123FA17823E0A783744FD91BC457965E11F0CD9DE1D4BC596A67834B82390C504F78B0C7B82E7646AAA117A285006302BF3A7E0DF88750D07E256836F637D79676EBE278ACC4504CD1A080C8EA62C290366091B7A60918A8E55CCEDD34F5B96AABA906A7F2F23E90F871F10BE09F802EEF747F1A7847E2A7867576BC7682CED6E21D72D544D3620B56668A19E452BFB8224DECEC1B3970A449F1B7C2D69E19F0C2E9FA6F857C6CD1DE5BACA977AA5D47E468A1182ABDCCCD184861755908F3828505DC490B20073B5FF12EA579FB1AFECA3AB4DA85ECBAA5E6B1E34F0EDC5E3CECD713E9915ED898EC5DC9DCD6C8679CAC24EC5F3A4C28DED9F34FD8D356BAD7751F1C5C5F5CDC5E5C68FE00BB9EC259E4323D8C8F2C10BBC44E4A334534B192B82525753C3106A314E2EA7E17396527CCA275DF04BC3BE13D2B5885754BBD6BC417BE22B71323C3F69FB1EA28ACF926056592F42B29DBF3AA3AA8210835EA179A27C23B8FB6D9B7C33D0FC6FA258DB1B692E20D0AEB49B8478DCF9BBEF889A470009029E0B1655F3D026C3C67C41823D37F6ADF12585BA2DBD8E9B1C56B696D18DB0DAC25A5531C6A3854C123680060D755E21D72F742F1EF8563B1BCBAB38DB5A4B72B04AD18313247B93008F94F71D0D79D526DBBEBF79E8D1F75688EFF00C15FB3CE83E3EF0559EA9F0DED3C71E0D9AD6F5534CB537C9E24D17E67DD08B682E989499A5621440124694A0471BC964D37E3378EBE1D787F58F0EDDF86F43D7A3D4986937976D7B756763736CFF2B47708F2496B67E5C79CB3792600EB2153E5AA5646BDE1CD3EDBE2CEA16B1D859C76DA8EB56B697712C0A23BA865B688C91C8B8C323924B29C86C9CE735DC7C0DBF9ED3F663F14B4534D1B69FA8BFD94A39536DE5C6366CFEEEDDAB8C631B463A5714E4E12F7B5575BF9F9EE7A907CD0BF5B1FFFD9
```

| 1 bits                            | 7 bits        | 1 byte       | 16 bits (LE)      | 64 bits (LE)                                                                            | 1~1012 bytes      |
|-----------------------------------|---------------|--------------|-------------------|-----------------------------------------------------------------------------------------|-------------------|
| マジック (`0` Chunk or `1` End Chunk） | リザーブ (`0` 詰め) | バージョン `0x31` | Additive（0~65535） | 次チャンクの `Key` (64 bits unsigned int) 、マジック `End Chunk` の場合はチェックサム (64 bits unsigned int) | チャンクデータ (バイナリデータ) |

ヘッダーは先頭 12 bytes 分

**・マジック (先頭 1 bits)**

- `0`: 途中のチャンク（Chunk）
- `1`: 最後のチャンク（End Chunk）

**・リザーブビット (7 bits)**

将来のバージョン用にリザーブ。現状は `0` で詰めるものとする。

**・バージョン (8 bits)**

- `0x31`: バージョン (8 bits)

> V1 と V2 を確実に判別するために常に `0x31` 以上のバージョンを使用します。
> V1 はこのバイトが `0x30` になるためです。

**・Additive (16 bits unsigned int, リトルエンディアン)**

Forge の際に追加できる数値 0～65535 の「添加物」です。
`Additive` を加えると、同じデータあっても `Metal ID` 及びチャンクの `Key` が変化します。
レアケースで予想される `Key` 衝突対策です。

`Additive` はデコードの際は不要な物ですが、
元データと照合するときに必要になります（`Additive` が一致しないと `Metal ID` 及びチャンクの `Key` が一致しない）

ただし、`Additive` は全チャンクの `Value` 上で見えるので、いちいち控えておかなくても問題ないかもしれません。

**・次チャンクの Key (64 bits unsigned int, リトルエンディアン)**

マジック `End Chunk` のチャンクは、次チャンクの Key (64 bits unsigned int) が入ります。

`End Chunk` のチャンクは次がない代わりに、
データ全体のチェックサム（sha3_256 ハッシュ値下位 64 bits unsigned int）が入ります。

> **チェックサム対象は元ファイルのバイナリ生データです**

チェックサムサンプルコード

```typescript
const generateChecksum = (input: Uint8Array): UInt64 => {
    if (input.length === 0) {
        throw Error("Input must not be empty");
    }
    const buf = sha3_256.arrayBuffer(input);
    const result = new Uint32Array(buf);
    return new UInt64([result[0], result[1]]);
};
```

**・チャンクデータ (バイナリデータ)**

バイナリデータを 1012 byte 以下の断片に分けて一つずつチャンクに格納します。
`C` チャンクであっても、1 byte 以上 1012 byte 以下であればどの様な長さでも良いです。 

> `End Chunk` にデータ全体のチェックサムが入るので、同じ内容のチャンクが現れても `Key` が衝突することがありません。

**・エンコード**

あるチャンクの `Value` には、次チャンクの `Key` が必要になるため、必ずデータチャンク列の最後尾から先頭に向かう順に処理していきます。

**・デコード**

デコードは、チャンクデータ部分（`Value` の 14 bytes 目以降）を先頭から順番にバイナリデータとして繋げていけば完成です。

#### 5.2.2. メタデータの Key

**例:** `53BA1A7F58B830D1`

1. チャンクの `Value` 全体の sha3_256 ハッシュ値下位 64 bits を取り出す。
2. 更に、最上位ビットを `0` に固定した 64 bits unsigned int 値が `Key` となる。

| (MSB側) 1 bit | 63 bits (LSB側)                      |
|--------------|-------------------------------------|
| 0            | `Value` 全体の sha3_256 ハッシュ下位 63 bits |

サンプルコード

```typescript
const generateMetadataKey = (input: Uint8Array): UInt64 => {
    if (input.length === 0) {
        throw Error("Input must not be empty");
    }
    const buf = sha3_256.arrayBuffer(input);
    const result = new Uint32Array(buf);
    return new UInt64([result[0], result[1] & 0x7FFFFFFF]);
};
```

> Symbol SDK の KeyGenerator で構成するメタデータ `Key` は、必ず最上位ビットが 1 になるように仕組まれているので、
> SDK を使っている限り衝突しにくい特徴があります。


#### 5.2.3. トランザクションについて

メタデータトランザクションの実行順序や Aggregate Transaction のインナートランザクションの構造には依存しません。


#### 5.2.4. チャンクの検証

Forge の際、メタデータの `Key` が `Value` から算出されていますから、
現 `Value` をもとに再計算した値が `Key` と一致していれば、改変の無い正常なチャンクということになります。


### 5.3. Metal の取得

`Metal ID` から `Composite Hash` を取り出し、REST Gateway の `/metadata/{compositeHash}` エンドポイントにアクセスすれば、
先頭のメタデータを取得できます。

そこから、Metal の全チャンクを集めるには今のところ二通りの方法があります。

#### 方法1: 個別に

先頭メタデータの `Value` をデコードして次チャンクの `Key` を取り出し、
`Composite Hash` を計算して `/metadata/{compositeHash}` エンドポイントで次チャンクを取得する事を、
マジック `End Chunk` のチャンクが来るまで繰り返す。

Metal が拡張した Symbol SDK を使用する場合は [BinMetadataHttp / getMetadata](https://github.com/OPENSPHERE-Inc/symbol-service/blob/2fc6c41fa4a5b8d755105bd74b7bd260d3e4feb1/src/libs/metadata.ts#L210) 
で実行可能です。

> チャンクの数だけ REST Gateway への連続アクセスが必要なので負荷と時間がかかる可能性があります。

#### 方法2: 一括で（余分なデータも含めて）

先頭のメタデータから `Metadata Type`, `Source Address`, `Target Address`, `Target ID (Mosaic or Namespace)` を取り出して、
`/metadata` エンドポイントにアクセスして、関連するすべてのメタデータを検索で取得してプールする。
メタデータプールの中で、先頭の `Key` から `E` チャンクまで順に辿って、必要なメタデータを集める。

Metal が拡張した Symbol SDK を使用する場合は [BinMetadataHttp / search](https://github.com/OPENSPHERE-Inc/symbol-service/blob/2fc6c41fa4a5b8d755105bd74b7bd260d3e4feb1/src/libs/metadata.ts#L188)
で実行可能です。

> まとめて取得できる分速いですが、検索条件で Metal のチャンクのみに絞り込めないので、余分なデータを取得する可能性があります。
> 
> 一つのターゲット（アカウント・モザイク・ネームスペース）に多数の Metal が Forge されていた場合は、
> 巨大なサイズのデータをブロックチェーンから取り出す事になります。

### 5.4. Metal の削除

メタデータトランザクションの内容を

- value_size_delta: -(現 `Value` のバイト数)
- value: 現 `Value` そのもの（厳密には現 `Value` と空データのビット毎 XOR = 結果的に現 `Value` と同じ）

として、Metal に連なる全てのチャンクメタデータに対して実行します。

> XOR をとる事はつまりビット毎の差分をとる事を意味します。


## 6. SDK (TypeScript / ECMAScript)

### 6.1. 使用前準備

パッケージへのインストールは以下のようにしてください。

```shell
yarn add metal-on-symbol
```

Symbol SDK も必要になるので、併せてインストールしましょう。

```shell
yarn add symbol-sdk
```

ネットワークプロパティを取得したりするため、Symbol ノードにアクセスする前提となります。
使用する際は、最初に必ず SymbolService と MetalServiceV2 の初期化をしてください。

```typescript
import {SymbolService, MetalServiceV2} from "metal-on-symbol";

const symbolService = new SymbolService(config);
const metalService = new MetalServiceV2(symbolService);
```

**引数**

- `config: SymbolServiceConfig` - コンフィグを指定
  - `node_url: string` - (Required) ノードURL
  - `fee_ratio: number` - **(Optional)** トランザクション手数料率 (0.0 ～ 1.0, デフォルト 0.0）
  - `deadline_hours: number` - **(Optional)** トランザクション有効期限（デフォルト 5 時間）
  - `batch_size: number` - **(Optional)** Aggregate インナートランザクション最大数（デフォルト 100）
  - `max_parallels: number` - **(Optional)** トランザクションアナウンス並列数（デフォルト 10）
  - `repo_factory_config: RepositoryFactoryConfig` - **(Optional)** Symbol SDK の RepositoryFactoryHttp コンストラクタに渡すコンフィグ  
  - `repo_factory: RepositoryFactoryHttp` - **(Optional)** RepositoryFactoryHttp インスタンスそのもの
    
**サンプルコード**

```typescript
import {SymbolService, MetalServiceV2} from "metal-on-symbol";

const symbolService = new SymbolService({node_url: "https://example.jp:3001"});
const metalService = new MetalServiceV2(symbolService);
```

### 6.2. BinMetadata API (Symbol SDK 拡張)

Metal on Symbol V2 では、バイナリペイロードの Metal にアクセスするために、Symbol SDK (v2) を独自に拡張しています (BinMetadata API）

これらの API は `BinMetadataHttp` をインスタンス化することで使用できます。
最終的には `BinMetadataEntry` の `value` プロパティが　`Uint8array` （すなわちバイナリデータ）で取得されます。

Symbol SDK (v2) の標準では、`MetadataEntry` の `value` プロパティが、内部的に utf-8 の文字列へ変換されてしまうため、
バイナリデータを正しく扱うことが不可能でした。

Metal で作成するメタデータへのアクセスは、Symbol SDK (v2)　標準の `MetadataHttp` を使用せず、
`BinMetadataHttp` (BinMetadata API) を使用してください。

あるいは、バイナリのメタデータ value を正しく扱える他の SDK を使用してください。

**サンプルコード**

```typescript
import { BinMetadataHttp } from "metal-on-symbol";

const nodeUrl = "https://node.example.jp:3001"

const searchBinMetadata = async (
    type: MetadataType,
    target?: Address,
    source?: Address,
    key?: UInt64,
    targetId?: MosaicId | NamespaceId,
    pageSize: number = 100,
) => {
    const binMetadataHttp = new BinMetadataHttp(nodeUrl);
    const searchCriteria: MetadataSearchCriteria = { 
        targetAddress: target, 
        sourceAddress: source, 
        scopedMetadataKey: key?.toHex(), 
        targetId: targetId, 
        metadataType: type,
        pageSize,
    };

    let batch;
    let pageNumber = 1;
    const metadataPool = new Array<BinMetadata>();
    do {
        batch = await firstValueFrom(
            metadataHttp.search({ ...searchCriteria, pageNumber: pageNumber++ })
        ).then((page) => page.data);
        metadataPool.push(...batch);
    } while (batch.length === pageSize);
    
    return metadataPool;
};
```

### 6.3. Forge

まず Forge するためのトランザクション群を生成します。

```typescript
const { txs, key, additive } = await metalService.createForgeTxs(
    type, 
    sourcePubAccount,
    targetPubAccount,
    targetId,
    payaload,
    additive,
    metadataPool
); 
```

**引数**

- `type: MetadataType` - メタデータタイプの一つを指定する（Account, Mosaic, Namespace）
- `sourcePubAccount: PublicAccount` - メタデータ付与元となるアカウント
- `targetPubAccount: PublicAccount` - メタデータ付与先となるアカウント
- `targetId: undefined | MosaicId | NamespaceId` - メタデータ付与先となるモザイク／ネームスペースのID。アカウントの場合は `undefined`
- `payload: Uint8Array` - Forge したいデータ（バイナリ可）
- `additive: number` - **(Optional)** 添加したい Additive で、省略すると 0 （必ず 0～65535 の整数であること）
- `metadataPool?: BinMetadata[]` - **(Optional)** オンチェーンに既にあるチャンクメタデータのプールで、あるものは生成トランザクションに含まれません。
  設定がなければ全てのトランザクションを生成します。

**戻り値**

- `txs: InnerTransaction[]` - メタデータタイプによって `AccountMetadataTransaction`、`MosaicMetadataTransaction`、
  `NamespaceMetadataTransaction` の何れかのトランザクションが含まれます。
- `key: UInt64` - 先頭のチャンクメタデータの `Key`
- `additive: number` - 実際に添加された Additive (0～65535) が返ります。衝突が発生して引数に指定したもの以外の、
  ランダム生成されたものが返る可能性があります。

次に `txs` に署名してブロックチェーンにアナウンスします。
パブリックチェーンの場合、一つのバッチは最大 100 件のトランザクションまでとされるので、
複数のバッチ（アグリゲートトランザクション）に分け、その全てに署名を行います。

```typescript
const batches = await symbolService.buildSignedAggregateCompleteTxBatches(
    txs,
    signerAccount,
    cosignerAccounts,
    feeRatio,
    batchSize,
);
```

**引数**

- `txs: InnerTransaction[]` - `metalService.createForgeTxs` で生成したトランザクションの配列
- `signerAccount: Account` - 署名するアカウント
- `cosignerAccounts: Account[]` - 連署するアカウントの配列（`signerAccount` および `sourcePubAccount`、`targetPubAccount`、`targetId` 
  の作成者・所有者が一致しない場合は、 登場人物全員の署名が必要です）
- `feeRatio: number` - **(Optional)** トランザクション手数料率を上書き（0.0～1.0。省略すると初期化時の値）
- `batchSize: number` - **(Optional)** インナートランザクション最大数を上書き（1～。省略すると初期化時の値）

**戻り値**

- `SignedAggregateTx[]` - 署名済みバッチ配列
  - `signedTx: SignedTransaction` - 署名済みのアグリゲートトランザクション（ただし、連署は含まれない）
  - `cosignatures: CosignaturesSignedTransaction[]` - 連署シグネチャーの配列
  - `maxFee: UInt64` - 計算されたトランザクション手数料。配列の全てを合計すると全体でかかる手数料になります。

バッチのリストを実際にブロックチェーンへアナウンスします。
以下の関数では、全てのトランザクションが承認されるか、最初にエラーが発生するまでウェイトします。

```typescript
const errors = await symbolService.executeBatches(batches, signerAccount, maxParallels);
```

**引数**

- `batches: SignedAggregateTx[]` - 署名済みバッチ配列
- `signerAccount: Account | PublicAccount` - 署名したアカウント。トランザクションを監視する為に指定します。従って `PublicAccount` でも可です。
- `maxParallels: number` - **(Optional)** トランザクションアナウンス並列数を上書き（1～。省略すると初期化時の値）

**戻り値**

- 成功の場合
  - `undefined`
- エラーがある場合は、以下のエラーオブジェクトの配列が返る
  - `txHash: string` - トランザクションハッシュ（HEX）
  - `error: string` - エラーメッセージ

> #### バッチ（SignedAggregateTx）を独自にアナウンスしたい
>
> 組み込みの `symbolService.executeBatches` を使わずに、
> `symbolService.buildSignedAggregateCompleteTxBatches` で署名したトランザクション `SignedAggregateTx` を、
> 独自のアナウンススタックで処理したい場合は以下のように統合できます。
>
> ```typescript
> const { signedTx, cosignatures } = batch;  // SignedAggregateTx
> const completeSignedTx = symbolService.createSignedTxWithCosignatures(
>     batch.signedTx,
>     batch.cosignatures
> );
> ```
>
> **引数**
>
> - `signedTx: SignedTransaction` - 署名済みのトランザクション（連署無し）
> - `cosignatures: CosignatureSignedTransaction[]` - 連署したシグネチャの配列
>
> **戻り値**
>
> - `SignedTransaction` - アナウンス可能な署名済みトランザクション
> 
> 以下、独自のアナウンススタックで `completeSignedTx` をアナウンスしてください。

以上で Forge は完了です。
最後に `Metal ID` を以下のように計算してください。

```typescript
// Static method
const metalId = MetalService.calculateMetalId(
    type,
    sourceAddress,
    targetAddress,
    targetId,
    key,
);
```
**引数**

- `type: MetadataType` - メタデータタイプ（Account, Mosaic, Namespace）
- `sourceAddress: Address` - メタデータ付与元のアカウントのアドレス
- `targetAddress: Address` - メタデータ付与先のアカウントのアドレス
- `targetId: undefined | MosaicId | NamespaceId` - メタデータ付与先のモザイク／ネームスペースID。アカウントの場合は `undefined`
- `key: UInt64` - 先頭チャンクメタデータの `Key`

**戻り値**

- `string` - 計算された `Metal ID`

**[サンプルコード](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/blob/master/src/nodejs/forge.ts)**

```typescript
const forgeMetal = async (
    type: MetadataType,
    sourcePubAccount: PublicAccount,
    targetPubAccount: PublicAccount,
    targetId: undefined | MosaicId | NamespaceId,
    payload: Uint8Array,
    signerAccount: Account,
    cosignerAccounts: Account[],
    additive?: number,
) => {
    const { key, txs, additive: newAdditive } = await metalService.createForgeTxs(
        type,
        sourcePubAccount,
        targetPubAccount,
        targetId,
        payload,
        additive,
    );
    const batches = await symbolService.buildSignedAggregateCompleteTxBatches(
        txs,
        signerAccount,
        cosignerAccounts,
    );
    const errors = await symbolService.executeBatches(batches, signerAccount);
    if (errors) {
        throw Error("Transaction error.");
    }
    const metalId = MetalService.calculateMetalId(
        type,
        sourcePubAccount.address,
        targetPubAccount.address,
        targetId,
        key,
    );

    return {
        metalId,
        key,
        additive: newAdditive,
    };
};
```

### 6.4. Forge（リカバリ）

何らかの理由（アカウントの残高不足等）で途中のトランザクションが失敗した場合、以下の手順でリカバリが可能です。

まず既に上がったメタデータを収集します。

```typescript
const metadataPool = await symbolService.searchMetadata(
    type, 
    {
        source: sourcePubAccount,
        target: targetPubAccount,
        targetId
    });
```

**引数**

- `type: MetadataType` - メタデータタイプ（Account, Mosaic, Namespace）
- `criteria`
  - `source: Account | PublicAccount | Address` - メタデータ付与元のアカウント
  - `target: Account | PublicAccount | Address` - メタデータ付与先のアカウント
  - `targetId: undefined | MosaicId | NamespaceId` - メタデータ付与先のモザイク／ネームスペースID。アカウントの場合は `undefined`

**戻り値**

- `BinMetadata[]` - メタデータリスト

得られたメタデータリストを `metalService.createForgeTxs` の `metadataPool` に渡してトランザクションを生成し、
あとは同じようにトランザクションへ署名してアナウンスしてください。

**[サンプルコード](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/blob/master/src/nodejs/forge_recover.ts)**

```typescript
const forgeMetal = async (
    type: MetadataType,
    sourcePubAccount: PublicAccount,
    targetPubAccount: PublicAccount,
    targetId: undefined | MosaicId | NamespaceId,
    payload: Uint8Array,
    signerAccount: Account,
    cosignerAccounts: Account[],
    additive?: number,
) => {
    const metadataPool = await symbolService.searchMetadata(
        type, 
        {
            source: sourcePubAccount,
            target: targetPubAccount,
            targetId
        });
    const { key, txs, additive: newAdditive } = await metalService.createForgeTxs(
        type,
        sourcePubAccount,
        targetPubAccount,
        targetId,
        payload,
        additive,
        metadataPool,
    );
    // ...以下略...
};
```

### 6.5. Fetch

#### Metal ID で Fetch

`Metal ID` が分かっている場合は、以下のようにメタルを取得します。

```typescript
const result = await metalService.fetchByMetalId(metalId);
```

**引数**

- `metalId: string` - Metal ID

**戻り値**

- `payload: Uint8Array` - デコードされたデータ。チャンクが壊れている場合でも途中までのデータが返ります。
- `type: MetadataType` - メタデータタイプ（Account, Mosaic, Namespace）
- `sourceAddress: Address` - メタデータ付与元のアカウントアドレス
- `targetAddress: Address` - メタデータ付与先のアカウント
- `targetId: undefined | MosaicId | NamespaceId` - メタデータ付与先のモザイク／ネームスペースID。アカウントの場合は `undefined`
- `key: UInt64` - 先頭チャンクメタデータの `Key`

`Metal ID` が見つからない場合は例外をスローします。

**[サンプルコード](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/blob/master/src/nodejs/fetch.ts)**

#### 先頭チャンクメタデータで Fetch

`Metal ID` が分からなくても、先頭チャンクのメタデータを特定できれば Metal を取得できます。

```typescript
const payload = await metalService.fetch(type, sourceAddress, targetAddress, targetId, key);
```

**引数**

- `type: MetadataType` - メタデータタイプ（Account, Mosaic, Namespace）
- `sourceAddress: Address` - メタデータ付与元のアカウントアドレス
- `targetAddress: Address` - メタデータ付与先のアカウントアドレス
- `targetId: undefined | MosaicId | NamespaceId` - メタデータ付与先のモザイク／ネームスペースID。アカウントの場合は `undefined`
- `key: UInt64` - 先頭チャンクメタデータの `Key`

**戻り値**

- `Uint8Array` - デコードされたデータ。チャンクが壊れている場合でも途中までのデータが返ります。

**[サンプルコード](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/blob/master/src/nodejs/fetch_by_key.ts)**

### 6.6. Scrap

#### Metal ID で Scrap 

まず、先頭チャンクメタデータを取得します。

```typescript
const metadata = (await metalService.getFirstChunk(metalId)).metadataEntry;
const { metadataType: type, targetId, scopedMetadataKey: key } = metadata;
```

**引数**

- `metalId: string` - Metal ID

**戻り値**

- `Metadata` - 先頭チャンクメタデータ

`Metal ID` が見つからない場合は例外をスローします。

次に、Scrap トランザクション群を生成します。

```typescript
const txs = await metalService.createScrapTxs(
    type,
    sourcePubAccount,
    targetPubAccount,
    targetId,
    key,
    metadataPool,
);
```

**引数**

- `type: MetadataType` - メタデータタイプ（Account, Mosaic, Namespace）
- `sourcePubAccount: PublicAccount` - メタデータ付与元のアカウント
- `targetPubAccount: PublicAccount` - メタデータ付与先のアカウント
- `targetId: undefined | MosaicId | NamespaceId` - メタデータ付与先のモザイク／ネームスペースID。アカウントの場合は `undefined`
- `key: UInt64` - 先頭チャンクメタデータの `Key`
- `metadataPool?: BinMetadata[]` - **(Optional)** 取得済みのメタデータプールがあれば渡すことができ、内部で再度取得する無駄を省けます。通常は指定不要
 
> メタデータからはトランザクション生成に必要なパブリックキーが取得できないので、別途入手してsourcePubAccount と targetPubAccount を渡す必要がある仕様です。

**戻り値**

- 成功の場合
  - `InnerTransaction[]` - メタデータタイプによって `AccountMetadataTransaction`、`MosaicMetadataTransaction`、
    `NamespaceMetadataTransaction` の何れかのトランザクションが含まれます。
- 失敗の場合
  - `undefined`

後は Forge と同様に生成されたトランザクションに署名してアナウンスしてください。

**[サンプルコード](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/blob/master/src/nodejs/scrap.ts)**

```typescript
const scrapMetal = async (
    metalId: string,
    sourcePubAccount: PublicAccount,
    targetPubAccount: PublicAccount,
    signerAccount: Account,
    cosignerAccounts: Account[]
) => {
    const metadataEntry = (await metalService.getFirstChunk(metalId)).metadataEntry;
    const txs = await metalService.createScrapTxs(
        metadataEntry.metadataType,
        sourcePubAccount,
        targetPubAccount,
        metadataEntry.targetId,
        metadataEntry.scopedMetadataKey,
    );
    if (!txs) {
        throw Error("Transaction creation error.");
    }
    const batches = await symbolService.buildSignedAggregateCompleteTxBatches(
        txs,
        signerAccount,
        cosignerAccounts,
    );
    const errors = await symbolService.executeBatches(batches, signerAccount);
    if (errors) {
        throw Error("Transaction error.");
    }
};
```

#### 元ファイルを参照して Scrap

`Metal ID` が分からなくても元ファイルを指定して Scrap することができます。
元ファイル（と Forge で添加された `Additive`）があれば `Metal ID` を再計算可能だからです。

> メタデータ特定情報の一部も必要です。

また、この方法では先頭チャンクや途中チャンクが壊れた Metal でも Scrap することができます。

この場合、以下のように、Scrap トランザクション群を生成します。

```typescript
const txs = await metalService.createDestroyTxs(
    type,
    sourcePubAccount,
    targetPubAccount,
    targetId,
    payload,
    additive,
    metadataPool,
);
```

**引数**

- `type: MetadataType` - メタデータタイプ（Account, Mosaic, Namespace）
- `sourcePubAccount: PublicAccount` - メタデータ付与元のアカウント
- `targetPubAccount: PublicAccount` - メタデータ付与先のアカウント
- `targetId: undefined | MosaicId | NamespaceId` - メタデータ付与先のモザイク／ネームスペースID。アカウントの場合は `undefined`
- `payload: Uint8Array` - 元ファイルのデータ（バイナリ可）
- `additive: number` - Forge 時に添加した Additive（必ず 0～65535 の整数であること）
- `metadataPool?: BinMetadata[]` - **(Optional)** 取得済みのメタデータプールがあれば渡すことができ、内部で再度取得する無駄を省けます。通常は指定不要

**戻り値**

- `InnerTransaction[]` - メタデータタイプによって `AccountMetadataTransaction`、`MosaicMetadataTransaction`、
  `NamespaceMetadataTransaction` の何れかのトランザクションが含まれます。

後は Forge と同様に生成されたトランザクションに署名してアナウンスしてください。

**[サンプルコード](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/blob/master/src/nodejs/scrap_by_payload.ts)**

```typescript
const destroyMetal = async (
    type: MetadataType,
    sourcePubAccount: PublicAccount,
    targetPubAccount: PublicAccount,
    targetId: undefined | MosaicId | NamespaceId,
    payload: Uint8Array,
    additive: number,
    signerAccount: Account,
    cosignerAccounts: Account[]
) => {
    const txs = await metalService.createDestroyTxs(
        type,
        sourcePubAccount,
        targetPubAccount,
        targetId,
        payload,
        additive,
    );
    if (!txs) {
        throw Error("Transaction creation error.");
    }
    // ...以下略...
};
```

### 6.7. Verify

手元のファイルとオンチェーンの Metal を照合します。

まず、`Metal ID` で先頭チャンクメタデータを取得してください。

```typescript
const metadata = (await metalService.getFirstChunk(metalId)).metadataEntry;
const {
    metadataType: type,
    sourceAddress,
    targetAddress,
    targetId, 
    scopedMetadataKey: key
} = metadata;
```

次に、先頭チャンクメタデータから得られた情報と、手元ファイルのデータを照合します。

```typescript
const { mismatches, maxLength } = await metalService.verify(
    payload,
    type,
    sourceAddress,
    targetAddress,
    key,
    targetId,
    metadataPool,
);
```

**引数**

- `payload: Uint8Array` - 元ファイルのデータ（バイナリ可）
- `type: MetadataType` - メタデータタイプ（Account, Mosaic, Namespace）
- `sourceAddress: Address` - メタデータ付与元のアドレス
- `targetAddress: Address` - メタデータ付与先のアドレス
- `key: UInt64` - 先頭チャンクメタデータの `Key`
- `targetId: undefined | MosaicId | NamespaceId` - メタデータ付与先のモザイク／ネームスペースID。アカウントの場合は `undefined`
- `metadataPool?: BinMetadata[]` - **(Optional)** 取得済みのメタデータプールがあれば渡すことができ、内部で再度取得する無駄を省けます。通常は指定不要

**戻り値**

- `mismatches: number` - ミスマッチしたバイト数。ゼロならデータ完全一致
- `maxLength: number` - 元ファイル、オンチェーンの何れか、サイズが大きい方のバイト数

**[サンプルコード](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/blob/master/src/nodejs/verify.ts)**

```typescript
const verifyMetal = async (
    metalId: string,
    payload: Uint8Array,
) => {
    const {
        metadataType: type,
        sourceAddress,
        targetAddress,
        targetId, 
        scopedMetadataKey: key,
    } = (await metalService.getFirstChunk(metalId)).metadataEntry;
    const { mismatches, maxLength } = await metalService.verify(
        payload,
        type,
        sourceAddress,
        targetAddress,
        key,
        targetId,
    );
    return mismatches === 0;
};
```

### 6.8. デコードだけ

自前のコードでオンチェーンのメタデータを取得した場合は、デコードだけ行うことも可能です。

```typescript
// Static method
const payloadBytes = MetalServiceV2.decode(key, metadataPool);
```

**引数**

- `key: UInt64` - 先頭チャンクメタデータの `Key`
- `metadataPool: BinMetadata[]` - Metal の全チャンクを含むメタデータのプール

> metadataPool は、メタデータの `type`, `sourcePubAccount`, `targetPubAccount`, `targetId` が同一である事を前提にしています。

**戻り値**

- `Uint8Array` - バイナリデータ。チャンクが壊れていても途中までのデータが返ります。

**[サンプルコード](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/blob/master/src/nodejs/decode.ts)**

```typescript
const payload = MetalServiceV2.decode(key, metadataPool);
```

### 6.9. ユーティリティ

#### ・チャンクメタデータ Key の生成

```typescript
// Static method
const key = MetalServiceV2.generateMetadataKey(input);
```

**引数**

- `input: string | Uint8array` - 入力データ（バイナリの場合は Uint8array を使用）

**戻り値**

- `UInt64` - メタデータ `Key`

#### ・チェックサムの計算

```typescript
// Static method
const checksum = MetalServiceV2.generateChecksum(input);
```

**引数**

- `input: Uint8Array` - 入力生データ（バイナリ）

**戻り値**

- `UInt64` - 64 bits チェックサム値

> base64 形式ではない生のバイナリデータを使用することに注意

#### ・Metal ID から Composite Hash の復元

```typescript
// Static method
const compositeHash = MetalServiceV2.restoreMetadataHash(metalId);
```

**引数**

- `metalId: string` - Metal ID

**戻り値**

- `string` - `Composite Hash` 値の64文字 HEX

#### ・暗号化 (AES-GCM)

```typescript
// Static method
const encryptedData = SymbolService.encryptBinary(plainData, senderAccount, recipientPubAccount);
```

**引数**

- `plainData: Uint8Array` - 平文のデータ（バイナリ）
- `senderAccount: Account` - 送信者のアカウント
- `recipientPubAccount: PublicAccount` - 受信者のパブリックアカウント

**戻り値**

- `Uint8Array` - 暗号データ（バイナリ）

#### ・復号化 (AES-GCM)

```typescript
// Static method
const plainData = SymbolService.decryptBinary(encryptedData, senderPubAccount, recipientAccount);
```

**引数**

- `encryptData: Uint8Array` - 暗号データ（バイナリ）
- `senderPubAccount: PublicAccount` - 送信者のパブリックアカウント
- `recipientAccount: Account` - 受信者のアカウント

**戻り値**

- `Uint8Array` - 平文データ（バイナリ）

### 6.10. サンプルコード

[こちら](https://github.com/OPENSPHERE-Inc/metal-sdk-sample) のリポジトリにサンプルコードをアップしてあります。

- [Node.js 用](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/tree/master/nodejs)
- [Browser (React) 用](https://github.com/OPENSPHERE-Inc/metal-sdk-sample/tree/master/browser-react)
