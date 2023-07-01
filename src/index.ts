import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt } from 'azle'
import { v4 as uuidv4 } from 'uuid'
 

type ToDo = Record<{
    id: string
    title: string
    body: string
    tag: string
    completed: boolean
    created_at: nat64
    updated_at: Opt<nat64>
}>

type ToDoPayload = Record<{
    title: string
    body: string
    tag: string
}>

const todosStorage = new StableBTreeMap<string, ToDo>(0, 44, 512)

$query
export function getToDos(): Result<Vec<ToDo>, string> {
    return Result.Ok(todosStorage.values())
}

$query
export function getToDosByTag(tag: string, startIndex: nat64, endingIndex: nat64): Result<Vec<ToDo>, string> {
    const length = todosStorage.len()
    if (length < startIndex || length < endingIndex) {
        return Result.Err("One of the indexes is out of bounds.")
    }
    if (startIndex > endingIndex) {
        return Result.Err(`The startIndex: ${startIndex} can't be greater than the endingIndex: ${endingIndex}.`)
    }
    if (endingIndex - startIndex > 2) {
        return Result.Err("You can only fetch two items at a time.")
    }
    const toDos = todosStorage.items();
    const filteredToDos: Vec<ToDo> = [];
    for (let i = startIndex; i < endingIndex; i++) {
        if (toDos[Number(i)][1].tag == tag) {
            filteredToDos.push(toDos[Number(i)][1]);
        }
    }
    
    return Result.Ok(filteredToDos)
}

$query
export function getToDo(id: string): Result<ToDo, string> {
    return match(todosStorage.get(id), {
        Some: (todo) => Result.Ok<ToDo, string>(todo),
        None: () => Result.Err<ToDo, string>(`A todo with id=${id} was not found.`)
    })
}

$query
export function searchByTitleOrBody(query: string): Result<Vec<ToDo>, string> {
    const todos = todosStorage.values();
    const filteredToDos: Vec<ToDo> = todos.filter((todo) => {
        const titleMatch = todo.title.toLowerCase().includes(query.toLowerCase());
        const bodyMatch = todo.body.toLowerCase().includes(query.toLowerCase());
        return titleMatch || bodyMatch;
    });
    return Result.Ok(filteredToDos);
}

$query
export function sortByDate(order: 'ascending' | 'descending'): Result<Vec<ToDo>, string> {
    const todos = todosStorage.values();
    const sortedToDos = [...todos].sort((a, b) => {
        if (order === 'ascending') {
            return a.created_at - b.created_at;
        } else {
            return b.created_at - a.created_at;
        }
    });
    return Result.Ok(sortedToDos);
}

$update
export function addToDo(payload: ToDoPayload): Result<ToDo, string> {
    const err = checkPayload(payload);
    if (err.length > 0) {
        return Result.Err<ToDo, string>(err)
    }
    const todo: ToDo = { id: uuidv4(), created_at: ic.time(), updated_at: Opt.None, completed: false, ...payload }
    todosStorage.insert(todo.id, todo)
    return Result.Ok(todo)
}

$update
export function updateToDo(id: string, payload: ToDoPayload): Result<ToDo, string> {
    const err = checkPayload(payload);
    if (err.length > 0) {
        return Result.Err<ToDo, string>(err)
    }
    return match(todosStorage.get(id), {
        Some: (todo) => {
            const updatedToDo: ToDo = {...todo, ...payload, updated_at: Opt.Some(ic.time())}
            todosStorage.insert(todo.id, updatedToDo)
            return Result.Ok<ToDo, string>(updatedToDo)
        },
        None: () => Result.Err<ToDo, string>(`Couldn't update a todo with id=${id}. Todo not found.`)
    })
}

$update
export function deleteToDo(id: string): Result<ToDo, string> {
    return match(todosStorage.remove(id), {
        Some: (deletedTodo) => Result.Ok<ToDo, string>(deletedTodo),
        None: () => Result.Err<ToDo, string>(`Couldn't delete a todo with id=${id}. Todo not found.`)
    })
}

$update
export function completeToDo(id: string): Result<ToDo, string> {
    return match(todosStorage.get(id), {
        Some: (todo) => {
            if (todo.completed) {
                return Result.Err<ToDo, string>(`Todo with id=${id} has already been completed.`)
            }
            const updatedToDo: ToDo = {...todo, completed: true, updated_at: Opt.Some(ic.time())}
            todosStorage.insert(todo.id, updatedToDo)
            return Result.Ok<ToDo, string>(updatedToDo)
        },
        None: () => Result.Err<ToDo, string>(`Couldn't update a todo with id=${id}. Todo not found.`)
    })
}

function checkPayload(payload: ToDoPayload): string {
    if (payload.title.length == 0) {
        return "Empty title";
    }
    if (payload.body.length == 0) {
        return "Empty body";
    }
    return "";
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
    getRandomValues: () => {
        let array = new Uint8Array(32)

        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256)
        }

        return array
    }
}

